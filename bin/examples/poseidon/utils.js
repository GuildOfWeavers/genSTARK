"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const assert = require("assert");
const crypto = require("crypto");
// MODULE VARIABLES
// ================================================================================================
const CONSTANT_SEED = 'Hades';
// PUBLIC FUNCTIONS
// ================================================================================================
function createHash(field, exp, rf, rp, stateWidth) {
    const m = stateWidth;
    const mds = field.newMatrixFrom(getMdsMatrix(field, m));
    const ark = getRoundConstants(field, m, rf + rp).map(v => field.newVectorFrom(v));
    return function (inputs) {
        let stateValues = [];
        assert(inputs.length < m);
        assert(inputs.length > 0);
        for (let i = 0; i < inputs.length; i++)
            stateValues[i] = inputs[i];
        for (let i = inputs.length; i < m; i++)
            stateValues[i] = field.zero;
        let state = field.newVectorFrom(stateValues);
        for (let i = 0; i < rf + rp; i++) {
            state = field.addVectorElements(state, ark[i]);
            if ((i < rf / 2) || (i >= rf / 2 + rp)) {
                state = field.expVectorElements(state, exp);
            }
            else {
                stateValues = state.toValues();
                stateValues[m - 1] = field.exp(stateValues[m - 1], exp);
                state = field.newVectorFrom(stateValues);
            }
            state = field.mulMatrixByVector(mds, state);
        }
        return state.toValues().slice(0, 2);
    };
}
exports.createHash = createHash;
function getRoundConstants(field, width, rounds) {
    const result = new Array(rounds);
    for (let i = 0, c = 0; i < rounds; i++) {
        let values = new Array(width);
        for (let j = 0; j < width; j++, c++) {
            let value = crypto.createHash('sha256').update(`${CONSTANT_SEED}${c}`).digest();
            values[j] = field.add(BigInt(`0x${value.toString('hex')}`), 0n);
        }
        result[i] = values;
    }
    return result;
}
exports.getRoundConstants = getRoundConstants;
function getMdsMatrix(field, width) {
    const xValues = getConstants(field, 'HadesMDSx', width);
    const yValues = getConstants(field, 'HadesMDSy', width);
    const values = [...xValues, ...yValues];
    if (new Set(values).size !== width * 2)
        throw new Error('MDS values are not all different');
    const result = new Array(width);
    for (let i = 0; i < width; i++) {
        result[i] = new Array(width);
        for (let j = 0; j < width; j++) {
            result[i][j] = field.inv(field.sub(xValues[i], yValues[j]));
        }
    }
    return result;
}
exports.getMdsMatrix = getMdsMatrix;
;
function transpose(matrix) {
    const rowCount = matrix.length;
    const colCount = matrix[0].length;
    const result = new Array(colCount);
    for (let i = 0; i < colCount; i++) {
        result[i] = new Array(rowCount);
        for (let j = 0; j < rowCount; j++) {
            result[i][j] = matrix[j][i];
        }
    }
    return result;
}
exports.transpose = transpose;
function getRoundControls(fRounds, pRounds, steps) {
    const result = [];
    for (let i = 0; i < fRounds + pRounds; i++) {
        if ((i < fRounds / 2) || (i >= fRounds / 2 + pRounds)) {
            result.push(1n);
        }
        else {
            result.push(0n);
        }
    }
    while (result.length < steps) {
        result.push(0n);
    }
    return result;
}
exports.getRoundControls = getRoundControls;
// HELPER FUNCTION
// ================================================================================================
function getConstants(field, seed, count) {
    const result = new Array(count);
    for (let i = 0; i < count; i++) {
        let value = crypto.createHash('sha256').update(`${seed}${i}`).digest();
        result[i] = field.add(BigInt(`0x${value.toString('hex')}`), 0n);
    }
    return result;
}
// MERKLE TREE
// ================================================================================================
class MerkleTree {
    constructor(values, hash) {
        this.nodes = [...new Array(values.length), ...values];
        for (let i = values.length - 1; i > 0; i--) {
            this.nodes[i] = hash(this.nodes[i * 2].concat(this.nodes[i * 2 + 1]));
        }
    }
    get root() {
        return this.nodes[1];
    }
    prove(index) {
        index += Math.floor(this.nodes.length / 2);
        const proof = [this.nodes[index]];
        while (index > 1) {
            proof.push(this.nodes[index ^ 1]);
            index = index >> 1;
        }
        return proof;
    }
    static verify(root, index, proof, hash) {
        index += 2 ** proof.length;
        let v = proof[0];
        for (let i = 1; i < proof.length; i++) {
            if (index & 1) {
                v = hash(proof[i].concat(v));
            }
            else {
                v = hash(v.concat(proof[i]));
            }
            index = index >> 1;
        }
        return root[0] === v[0] && root[1] === v[1];
    }
}
exports.MerkleTree = MerkleTree;
//# sourceMappingURL=utils.js.map