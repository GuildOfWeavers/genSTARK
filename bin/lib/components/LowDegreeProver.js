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
    constructor(queryCount, hasAlgorithm, context) {
        this.hashAlgorithm = hasAlgorithm;
        this.queryCount = queryCount;
        this.field = context.field;
        this.skipMultiplesOf = context.extensionFactor;
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    prove(lTree, values, domain, maxDegreePlus1) {
        const result = {
            components: new Array(),
            remainder: []
        };
        this.fri(lTree, values, maxDegreePlus1, 0, domain, result);
        return result;
    }
    verify(lRoot, maxDegreePlus1, rootOfUnity, proof) {
        let rouDegree = computeRootOfUnityDegree(rootOfUnity, this.field);
        // powers of the given root of unity 1, p, p**2, p**3 such that p**4 = 1
        const quarticRootsOfUnity = [1n,
            this.field.exp(rootOfUnity, BigInt(rouDegree) / 4n),
            this.field.exp(rootOfUnity, BigInt(rouDegree) / 2n),
            this.field.exp(rootOfUnity, BigInt(rouDegree) * 3n / 4n)];
        // 1 ----- verify the recursive components of the proof
        for (let depth = 0; depth < proof.components.length; depth++) {
            let { columnRoot, columnProof, polyProof } = proof.components[depth];
            // calculate the pseudo-randomly sampled y indices
            let columnLength = Math.floor(rouDegree / 4);
            let positions = utils_1.getPseudorandomIndexes(columnRoot, this.queryCount, columnLength, this.skipMultiplesOf);
            // verify Merkle proof for the column
            if (!merkle_1.MerkleTree.verifyBatch(columnRoot, positions, columnProof, this.hashAlgorithm)) {
                throw new StarkError_1.StarkError(`Verification of column Merkle proof failed at depth ${depth}`);
            }
            // compute the positions for the values in the polynomial
            const polyPositions = new Array(positions.length * 4);
            for (let i = 0; i < positions.length; i++) {
                polyPositions[i * 4 + 0] = positions[i];
                polyPositions[i * 4 + 1] = positions[i] + columnLength;
                polyPositions[i * 4 + 2] = positions[i] + columnLength * 2;
                polyPositions[i * 4 + 3] = positions[i] + columnLength * 3;
            }
            // verify Merkle proof for polynomials
            if (!merkle_1.MerkleTree.verifyBatch(lRoot, polyPositions, polyProof, this.hashAlgorithm)) {
                throw new StarkError_1.StarkError(`Verification of polynomial Merkle proof failed at depth ${depth}`);
            }
            // For each y coordinate, get the x coordinates on the row, the values on
            // the row, and the value at that y from the column
            let xs = new Array(positions.length);
            let ys = new Array(positions.length);
            const polyValues = utils_1.buffersToBigInts(polyProof.values);
            for (let i = 0; i < positions.length; i++) {
                let xe = this.field.exp(rootOfUnity, BigInt(positions[i]));
                xs[i] = new Array(4);
                xs[i][0] = this.field.mul(quarticRootsOfUnity[0], xe);
                xs[i][1] = this.field.mul(quarticRootsOfUnity[1], xe);
                xs[i][2] = this.field.mul(quarticRootsOfUnity[2], xe);
                xs[i][3] = this.field.mul(quarticRootsOfUnity[3], xe);
                ys[i] = new Array(4);
                ys[i][0] = polyValues[i * 4];
                ys[i][1] = polyValues[i * 4 + 1];
                ys[i][2] = polyValues[i * 4 + 2];
                ys[i][3] = polyValues[i * 4 + 3];
            }
            // calculate the pseudo-random x coordinate
            const specialX = this.field.prng(lRoot);
            // verify for each selected y coordinate that the four points from the polynomial and the 
            // one point from the column that are on that y coordinate are on the same deg < 4 polynomial
            const polys = this.field.interpolateQuarticBatch(this.field.newMatrixFrom(xs), this.field.newMatrixFrom(ys));
            const columnValues = utils_1.buffersToBigInts(columnProof.values);
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
            rouDegree = Math.floor(rouDegree / 4);
        }
        // 2 ----- verify the remainder of the proof
        if (maxDegreePlus1 > proof.remainder.length) {
            throw new StarkError_1.StarkError(`Remainder degree cannot be greater than number of remainder values`);
        }
        // check that Merkle root matches up
        const cTree = merkle_1.MerkleTree.create(proof.remainder, this.hashAlgorithm);
        if (!cTree.root.equals(lRoot)) {
            throw new StarkError_1.StarkError(`Remainder values do not match Merkle root of the last column`);
        }
        const remainder = utils_1.buffersToBigInts(proof.remainder);
        this.verifyRemainder(this.field.newVectorFrom(remainder), maxDegreePlus1, rootOfUnity);
        return true;
    }
    // HELPER METHODS
    // --------------------------------------------------------------------------------------------
    fri(lTree, values, maxDegreePlus1, depth, domain, result) {
        // if there are not too many values left, use the polynomial directly as proof
        if (values.length <= 256) {
            const rootOfUnity = this.field.exp(domain.getValue(1), BigInt(4 ** depth));
            this.verifyRemainder(values, maxDegreePlus1, rootOfUnity);
            result.remainder = lTree.values;
            return;
        }
        // break values into rows and columns and sample 4 values for each row
        const domainStep = (4 ** depth);
        const xs = this.field.vectorToMatrix(domain, 4, domainStep);
        const ys = this.field.vectorToMatrix(values, 4);
        // build polynomials from values in each row
        const xPolys = this.field.interpolateQuarticBatch(xs, ys);
        // select a pseudo-random x coordinate and evaluate each row polynomial at the coordinate
        const specialX = this.field.prng(lTree.root);
        const column = this.field.evalQuarticBatch(xPolys, specialX);
        // put the resulting column into a merkle tree
        const hashDigestSize = merkle_1.getHashDigestSize(this.hashAlgorithm);
        const cTree = merkle_1.MerkleTree.create(utils_1.bigIntsToBuffers(column, hashDigestSize), this.hashAlgorithm);
        // compute spot check positions in the column and corresponding positions in the original values
        const columnLength = column.length;
        const positions = utils_1.getPseudorandomIndexes(cTree.root, this.queryCount, columnLength, this.skipMultiplesOf);
        const polyPositions = new Array(positions.length * 4);
        for (let i = 0; i < positions.length; i++) {
            polyPositions[i * 4 + 0] = positions[i];
            polyPositions[i * 4 + 1] = positions[i] + columnLength;
            polyPositions[i * 4 + 2] = positions[i] + columnLength * 2;
            polyPositions[i * 4 + 3] = positions[i] + columnLength * 3;
        }
        // build this component of the proof
        result.components.push({
            columnRoot: cTree.root,
            columnProof: cTree.proveBatch(positions),
            polyProof: lTree.proveBatch(polyPositions)
        });
        // recursively build all other components
        this.fri(cTree, column, Math.floor(maxDegreePlus1 / 4), depth + 1, domain, result);
    }
    verifyRemainder(remainder, maxDegreePlus1, rootOfUnity) {
        // exclude points which should be skipped during evaluation
        const positions = [];
        for (let i = 0; i < remainder.length; i++) {
            if (!this.skipMultiplesOf || i % this.skipMultiplesOf) {
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
}
exports.LowDegreeProver = LowDegreeProver;
// HELPER FUNCTIONS
// ================================================================================================
function computeRootOfUnityDegree(rootOfUnity, field) {
    let result = 1;
    while (rootOfUnity !== 1n) {
        result = result * 2;
        rootOfUnity = field.mul(rootOfUnity, rootOfUnity);
    }
    return result;
}
//# sourceMappingURL=LowDegreeProver.js.map