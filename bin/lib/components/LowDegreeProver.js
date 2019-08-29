"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const merkle_1 = require("@guildofweavers/merkle");
const utils_1 = require("../utils");
const StarkError_1 = require("../StarkError");
// CLASS DEFINITION
// ================================================================================================
class LowDegreeProver {
    // CONSTRUCTORS
    // --------------------------------------------------------------------------------------------
    constructor(idxGenerator, hash, context, logger) {
        this.field = context.field;
        this.rootOfUnity = context.rootOfUnity;
        this.hash = hash;
        this.idxGenerator = idxGenerator;
        this.log = logger;
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    prove(cEvaluations, domain, exeQueryPositions, maxDegreePlus1) {
        // transpose composition polynomial evaluations into a matrix with 4 columns
        const values = this.field.transposeVector(cEvaluations, 4);
        const componentCount = Math.min(Math.ceil(Math.log2(cEvaluations.length) / 2) - 4, 0); // TODO: improve
        // hash each row and put the result into a Merkle tree
        const lHashes = this.hash.digestValues(values.toBuffer(), 4 * this.field.elementSize);
        const lTree = merkle_1.MerkleTree.create(lHashes, this.hash);
        this.log('Built liner combination merkle tree');
        // build Merkle proofs but swap out hashed values for the un-hashed ones
        const lcPositions = getAugmentedPositions(exeQueryPositions, cEvaluations.length);
        const lcProof = lTree.proveBatch(lcPositions);
        lcProof.values = values.rowsToBuffers(lcPositions);
        const proof = {
            lcRoot: lTree.root,
            lcProof: lcProof,
            components: new Array(componentCount),
            remainder: []
        };
        this.fri(lTree, values, maxDegreePlus1, 0, domain, proof);
        return proof;
    }
    verify(proof, lcValues, exeQueryPositions, maxDegreePlus1) {
        let rootOfUnity = this.rootOfUnity;
        let columnLength = getRootOfUnityDegree(rootOfUnity, this.field);
        // powers of the given root of unity 1, p, p**2, p**3 such that p**4 = 1
        const quarticRootsOfUnity = [1n,
            this.field.exp(rootOfUnity, BigInt(columnLength) / 4n),
            this.field.exp(rootOfUnity, BigInt(columnLength) / 2n),
            this.field.exp(rootOfUnity, BigInt(columnLength) * 3n / 4n)];
        // 1 ----- check correctness of linear combination
        const lcProof = proof.lcProof;
        const lcPositions = getAugmentedPositions(exeQueryPositions, columnLength);
        const lcChecks = this.parseColumnValues(lcProof.values, exeQueryPositions, lcPositions, columnLength);
        lcProof.values = hashBuffers(lcProof.values, this.hash); // TODO: don't mutate the proof
        if (!merkle_1.MerkleTree.verifyBatch(proof.lcRoot, lcPositions, lcProof, this.hash)) {
            throw new StarkError_1.StarkError(`Verification of linear combination Merkle proof failed`);
        }
        for (let i = 0; i < lcValues.length; i++) {
            if (lcValues[i] !== lcChecks[i]) {
                throw new StarkError_1.StarkError(`Verification of linear combination correctness failed`);
            }
        }
        // 2 ----- verify the recursive components of the FRI proof
        let lRoot = proof.lcRoot;
        columnLength = Math.floor(columnLength / 4);
        for (let depth = 0; depth < proof.components.length; depth++) {
            let { columnRoot, columnProof, polyProof } = proof.components[depth];
            // calculate the pseudo-randomly sampled y indices
            let positions = this.idxGenerator.getFriIndexes(columnRoot, columnLength);
            let augmentedPositions = getAugmentedPositions(positions, columnLength);
            // verify Merkle proof for the column
            let columnValues = this.parseColumnValues(columnProof.values, positions, augmentedPositions, columnLength);
            columnProof.values = hashBuffers(columnProof.values, this.hash); // TODO: don't mutate the proof
            if (!merkle_1.MerkleTree.verifyBatch(columnRoot, augmentedPositions, columnProof, this.hash)) {
                throw new StarkError_1.StarkError(`Verification of column Merkle proof failed at depth ${depth}`);
            }
            // verify Merkle proof for polynomials
            let ys = this.parsePolyValues(polyProof.values);
            polyProof.values = hashBuffers(polyProof.values, this.hash); // TODO: don't mutate the proof
            if (!merkle_1.MerkleTree.verifyBatch(lRoot, positions, polyProof, this.hash)) {
                throw new StarkError_1.StarkError(`Verification of polynomial Merkle proof failed at depth ${depth}`);
            }
            // For each y coordinate, get the x coordinates on the row, the values on
            // the row, and the value at that y from the column
            let xs = new Array(positions.length);
            for (let i = 0; i < positions.length; i++) {
                let xe = this.field.exp(rootOfUnity, BigInt(positions[i]));
                xs[i] = new Array(4);
                xs[i][0] = this.field.mul(quarticRootsOfUnity[0], xe);
                xs[i][1] = this.field.mul(quarticRootsOfUnity[1], xe);
                xs[i][2] = this.field.mul(quarticRootsOfUnity[2], xe);
                xs[i][3] = this.field.mul(quarticRootsOfUnity[3], xe);
            }
            // calculate the pseudo-random x coordinate
            const specialX = this.field.prng(lRoot);
            // verify for each selected y coordinate that the four points from the polynomial and the 
            // one point from the column that are on that y coordinate are on the same deg < 4 polynomial
            const polys = this.field.interpolateQuarticBatch(this.field.newMatrixFrom(xs), this.field.newMatrixFrom(ys));
            const polyVectors = this.field.matrixRowsToVectors(polys);
            for (let i = 0; i < polys.rowCount; i++) {
                if (this.field.evalPolyAt(polyVectors[i], specialX) !== columnValues[i]) {
                    throw new StarkError_1.StarkError(`Degree 4 polynomial didn't evaluate to column value at depth ${depth}`);
                }
            }
            // update constants to check the next component
            lRoot = columnRoot;
            rootOfUnity = this.field.exp(rootOfUnity, 4n);
            maxDegreePlus1 = Math.floor(maxDegreePlus1 / 4);
            columnLength = Math.floor(columnLength / 4);
        }
        // 3 ----- verify the remainder of the FRI proof
        if (maxDegreePlus1 > proof.remainder.length) {
            throw new StarkError_1.StarkError(`Remainder degree is greater than number of remainder values`);
        }
        const remainder = this.field.newVectorFrom(proof.remainder);
        // check that Merkle root matches up
        const rMatrix = this.field.transposeVector(remainder, 4);
        const rHashes = this.hash.digestValues(rMatrix.toBuffer(), 4 * this.field.elementSize);
        const cTree = merkle_1.MerkleTree.create(rHashes, this.hash);
        if (!cTree.root.equals(lRoot)) {
            throw new StarkError_1.StarkError(`Remainder values do not match Merkle root of the last column`);
        }
        this.verifyRemainder(remainder, maxDegreePlus1, rootOfUnity);
        return true;
    }
    // HELPER METHODS
    // --------------------------------------------------------------------------------------------
    fri(lTree, values, maxDegreePlus1, depth, domain, result) {
        // if there are not too many values left, use the polynomial directly as proof
        if (values.rowCount <= 64) {
            const rootOfUnity = this.field.exp(domain.getValue(1), BigInt(4 ** depth));
            const tValues = this.field.transposeMatrix(values);
            const remainder = this.field.joinMatrixRows(tValues);
            this.verifyRemainder(remainder, maxDegreePlus1, rootOfUnity);
            result.remainder = remainder.toValues();
            this.log(`Computed FRI remainder of ${remainder.length} values`);
            return;
        }
        // build polynomials from each row of the values matrix
        const xs = this.field.transposeVector(domain, 4, (4 ** depth));
        const polys = this.field.interpolateQuarticBatch(xs, values);
        // select a pseudo-random x coordinate and evaluate each row polynomial at that coordinate
        const specialX = this.field.prng(lTree.root);
        const column = this.field.evalQuarticBatch(polys, specialX);
        // break the column in a matrix with 4 columns for the next layer of recursion
        const newValues = this.field.transposeVector(column, 4);
        // put the resulting matrix into a Merkle tree - 1 value per row
        const valueRowSize = 4 * this.field.elementSize;
        const rowHashes = this.hash.digestValues(newValues.toBuffer(), valueRowSize);
        const cTree = merkle_1.MerkleTree.create(rowHashes, this.hash);
        // recursively build all other components
        this.log(`Computed FRI layer at depth ${depth}`);
        this.fri(cTree, newValues, Math.floor(maxDegreePlus1 / 4), depth + 1, domain, result);
        // compute spot check positions in the column and corresponding positions in the original values
        const positions = this.idxGenerator.getFriIndexes(cTree.root, column.length);
        const augmentedPositions = getAugmentedPositions(positions, column.length);
        // build Merkle proofs but swap out hashed values for the un-hashed ones
        const columnProof = cTree.proveBatch(augmentedPositions);
        columnProof.values = newValues.rowsToBuffers(augmentedPositions);
        const polyProof = lTree.proveBatch(positions);
        polyProof.values = values.rowsToBuffers(positions);
        // build and add proof component to the result
        result.components[depth] = { columnRoot: cTree.root, columnProof, polyProof };
    }
    verifyRemainder(remainder, maxDegreePlus1, rootOfUnity) {
        // exclude points which should be skipped during evaluation
        const positions = [];
        for (let i = 0; i < remainder.length; i++) {
            if (!this.idxGenerator.extensionFactor || i % this.idxGenerator.extensionFactor) {
                positions.push(i);
            }
        }
        // pick a subset of points from the remainder and interpolate them into a polynomial
        const domain = this.field.getPowerSeries(rootOfUnity, remainder.length);
        const xs = new Array(maxDegreePlus1);
        const ys = new Array(maxDegreePlus1);
        for (let i = 0; i < maxDegreePlus1; i++) {
            let p = positions[i];
            xs[i] = domain.getValue(p);
            ys[i] = remainder.getValue(p);
        }
        const xVector = this.field.newVectorFrom(xs);
        const yVector = this.field.newVectorFrom(ys);
        const poly = this.field.interpolate(xVector, yVector);
        // check that polynomial evaluates correctly for all other points in the remainder
        for (let i = maxDegreePlus1; i < positions.length; i++) {
            let p = positions[i];
            if (this.field.evalPolyAt(poly, domain.getValue(p)) !== remainder.getValue(p)) {
                throw new StarkError_1.StarkError(`Remainder is not a valid degree ${maxDegreePlus1 - 1} polynomial`);
            }
        }
    }
    // PARSERS
    // --------------------------------------------------------------------------------------------
    parsePolyValues(buffers) {
        const elementSize = this.field.elementSize;
        const result = [];
        for (let buffer of buffers) {
            let values = new Array(4), offset = 0;
            ;
            for (let i = 0; i < 4; i++, offset += elementSize) {
                values[i] = utils_1.readBigInt(buffer, offset, elementSize);
            }
            result.push(values);
        }
        return result;
    }
    parseColumnValues(buffers, positions, augmentedPositions, columnLength) {
        const rowLength = columnLength / 4;
        const elementSize = this.field.elementSize;
        const result = [];
        for (let position of positions) {
            let idx = augmentedPositions.indexOf(position % rowLength);
            let buffer = buffers[idx];
            let offset = Math.floor(position / rowLength) * elementSize;
            result.push(utils_1.readBigInt(buffer, offset, elementSize));
        }
        return result;
    }
}
exports.LowDegreeProver = LowDegreeProver;
// HELPER FUNCTIONS
// ================================================================================================
function getRootOfUnityDegree(rootOfUnity, field) {
    let result = 1;
    while (rootOfUnity !== 1n) {
        result = result * 2;
        rootOfUnity = field.mul(rootOfUnity, rootOfUnity);
    }
    return result;
}
function getAugmentedPositions(positions, columnLength) {
    const rowLength = columnLength / 4;
    const result = new Set();
    for (let position of positions) {
        result.add(Math.floor(position % rowLength));
    }
    return Array.from(result);
}
function hashBuffers(values, hash) {
    const result = new Array(values.length);
    for (let i = 0; i < values.length; i++) {
        result[i] = hash.digest(values[i]);
    }
    return result;
}
//# sourceMappingURL=LowDegreeProver.js.map