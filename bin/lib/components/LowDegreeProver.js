"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const merkle_1 = require("@guildofweavers/merkle");
const utils_1 = require("../utils");
// CLASS DEFINITION
// ================================================================================================
class LowDegreeProver {
    // CONSTRUCTORS
    // --------------------------------------------------------------------------------------------
    constructor(field, skipMultiplesOf, spotCheckCount, hashAlgorithm) {
        this.field = field;
        this.skipMultiplesOf = skipMultiplesOf;
        this.hashAlgorithm = hashAlgorithm;
        this.spotCheckCount = spotCheckCount;
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
            let columnSize = Math.floor(rouDegree / 4);
            let sampleCount = Math.min(this.spotCheckCount, columnSize / 2);
            let positions = utils_1.getPseudorandomIndexes(columnRoot, sampleCount, columnSize, this.skipMultiplesOf);
            // compute the positions for the values in the polynomial
            const polyPositions = new Array(positions.length * 4);
            for (let i = 0; i < positions.length; i++) {
                polyPositions[i * 4 + 0] = positions[i];
                polyPositions[i * 4 + 1] = positions[i] + columnSize;
                polyPositions[i * 4 + 2] = positions[i] + columnSize * 2;
                polyPositions[i * 4 + 3] = positions[i] + columnSize * 3;
            }
            // verify Merkle proofs
            if (!merkle_1.MerkleTree.verifyBatch(columnRoot, positions, columnProof, this.hashAlgorithm)) {
                throw new Error('Low degree proof failed: merkle'); // TODO: StarkError
            }
            if (!merkle_1.MerkleTree.verifyBatch(lRoot, polyPositions, polyProof, this.hashAlgorithm)) {
                throw new Error('Low degree proof failed: merkle2'); // TODO: StarkError
            }
            // For each y coordinate, get the x coordinates on the row, the values on
            // the row, and the value at that y from the column
            let xs = new Array(positions.length);
            let ys = new Array(positions.length);
            const polyValues = utils_1.buffersToBigInts(polyProof.values);
            for (let i = 0; i < positions.length; i++) {
                let x1 = this.field.exp(rootOfUnity, BigInt(positions[i]));
                xs[i] = new Array(4);
                ys[i] = new Array(4);
                for (let j = 0; j < 4; j++) {
                    xs[i][j] = this.field.mul(quarticRootsOfUnity[j], x1);
                    ys[i][j] = polyValues[i * 4 + j];
                }
            }
            // calculate the pseudo-random x coordinate
            const specialX = this.field.prng(lRoot);
            // verify for each selected y coordinate that the four points from the
            // polynomial and the one point from the column that are on that y 
            // coordinate are on the same deg < 4 polynomial
            const columnValues = utils_1.buffersToBigInts(columnProof.values);
            const polys = this.field.interpolateQuarticBatch(xs, ys);
            for (let i = 0; i < polys.length; i++) {
                if (this.field.evalPolyAt(polys[i], specialX) !== columnValues[i]) {
                    throw new Error('Low degree proof failed: component'); // TODO: StarkError
                }
            }
            // update constants to check the next component
            lRoot = columnRoot;
            rootOfUnity = this.field.exp(rootOfUnity, 4n);
            maxDegreePlus1 = Math.floor(maxDegreePlus1 / 4);
            rouDegree = Math.floor(rouDegree / 4);
        }
        // 2 ----- verify the remainder of the proof
        // TODO: assert maxdeg_plus_1 <= 16
        // check that Merkle root matches up
        const cTree = merkle_1.MerkleTree.create(proof.remainder, this.hashAlgorithm);
        if (!cTree.root.equals(lRoot)) {
            throw new Error('Low degree proof failed: remainder 1'); // TODO: StarkError
        }
        // exclude points which should be skipped during evaluation
        const positions = [];
        for (let i = 0; i < proof.remainder.length; i++) {
            if (!this.skipMultiplesOf || i % this.skipMultiplesOf) {
                positions.push(i);
            }
        }
        // pick a subset of points from the remainder and interpolate them into a polynomial
        const remainder = utils_1.buffersToBigInts(proof.remainder);
        const domain = this.field.getPowerCycle(rootOfUnity);
        const xs = new Array(maxDegreePlus1);
        const ys = new Array(maxDegreePlus1);
        for (let i = 0; i < maxDegreePlus1; i++) {
            let p = positions[i];
            xs[i] = domain[p];
            ys[i] = remainder[p];
        }
        const poly = this.field.interpolate(xs, ys);
        // check that polynomial evaluates correctly for all other points in the remainder
        for (let i = maxDegreePlus1; i < positions.length; i++) {
            let p = positions[i];
            if (this.field.evalPolyAt(poly, domain[p]) !== remainder[p]) {
                throw new Error('Low degree proof failed: remainder 2'); // TODO: StarkError
            }
        }
        return true;
    }
    // HELPER METHODS
    // --------------------------------------------------------------------------------------------
    fri(lTree, values, maxDegreePlus1, depth, domain, result) {
        const hashDigestSize = merkle_1.getHashDigestSize(this.hashAlgorithm);
        // if the degree we are checking is less then or qual to 16, use the polynomial directly as proof
        if (values.length <= 256) {
            result.remainder = utils_1.bigIntsToBuffers(values, hashDigestSize);
            return;
        }
        // break values into rows and columns and sample 4 values for each row
        const domainStep = (4 ** depth);
        const columnLength = Math.floor(values.length / 4);
        let xs = new Array(columnLength);
        let ys = new Array(columnLength);
        for (let i = 0; i < columnLength; i++) {
            xs[i] = new Array(4);
            ys[i] = new Array(4);
            for (let j = 0; j < 4; j++) {
                xs[i][j] = domain[(i + columnLength * j) * domainStep];
                ys[i][j] = values[i + columnLength * j];
            }
        }
        // build polynomials for each row
        const xPolys = this.field.interpolateQuarticBatch(xs, ys);
        // select a pseudo-random x coordinate
        const specialX = this.field.prng(lTree.root);
        // build a column by evaluating each row polynomial at pseudo-random x coordinate
        const column = new Array(xPolys.length);
        for (let i = 0; i < column.length; i++) {
            column[i] = this.field.evalPolyAt(xPolys[i], specialX);
        }
        // put the resulting column into a merkle tree
        const column2 = utils_1.bigIntsToBuffers(column, hashDigestSize);
        const cTree = merkle_1.MerkleTree.create(column2, this.hashAlgorithm);
        // compute spot check positions in the column and corresponding positions in the original values
        const sampleCount = Math.min(this.spotCheckCount, column.length / 2);
        const positions = utils_1.getPseudorandomIndexes(cTree.root, sampleCount, column.length, this.skipMultiplesOf);
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