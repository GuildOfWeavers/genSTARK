"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// MODULE VARIABLES
// ================================================================================================
exports.MAX_ARRAY_LENGTH = 256;
exports.MAX_MATRIX_COLUMN_LENGTH = 127;
// PUBLIC FUNCTIONS
// ================================================================================================
function sizeOf(proof, fieldElementSize, hashDigestSize) {
    let size = hashDigestSize; // evRoot
    // evProof
    let evProof = sizeOfMerkleProof(proof.evProof);
    size += evProof.total;
    // ldProof
    let ldProof = 1; // ld component count
    const lcProof = sizeOfMerkleProof(proof.ldProof.lcProof);
    ldProof += lcProof.total + hashDigestSize; // + lc root
    const ldLevels = [];
    for (let component of proof.ldProof.components) {
        ldProof += hashDigestSize; // column root
        let column = sizeOfMerkleProof(component.columnProof);
        ldProof += column.total;
        let poly = sizeOfMerkleProof(component.polyProof);
        ldProof += poly.total;
        ldLevels.push({ column, poly, total: column.total + poly.total + hashDigestSize });
    }
    let ldRemainder = proof.ldProof.remainder.length * fieldElementSize;
    ldRemainder += 1; // 1 byte for remainder length
    ldLevels.push({ total: ldRemainder });
    ldProof += ldRemainder;
    size += ldProof;
    return { evProof, ldProof: { lcProof, levels: ldLevels, total: ldProof }, total: size };
}
exports.sizeOf = sizeOf;
function sizeOfMerkleProof(proof) {
    const values = sizeOfArray(proof.values);
    const nodes = sizeOfMatrix(proof.nodes);
    return { values, nodes, total: values + nodes + 1 }; // +1 for tree depth
}
exports.sizeOfMerkleProof = sizeOfMerkleProof;
// HELPER FUNCTIONS
// ================================================================================================
function sizeOfArray(array) {
    if (array.length === 0) {
        throw new Error(`Array cannot be zero-length`);
    }
    else if (array.length > exports.MAX_ARRAY_LENGTH) {
        throw new Error(`Array length (${array.length}) cannot exceed ${exports.MAX_ARRAY_LENGTH}`);
    }
    let size = 1; // 1 byte for array length
    for (let i = 0; i < array.length; i++) {
        size += array[i].length;
    }
    return size;
}
function sizeOfMatrix(matrix) {
    if (matrix.length > exports.MAX_ARRAY_LENGTH) {
        throw new Error(`Matrix column count (${matrix.length}) cannot exceed ${exports.MAX_ARRAY_LENGTH}`);
    }
    let size = 1; // 1 byte for number of columns
    size += matrix.length; // 1 byte for length and type of each column
    for (let i = 0; i < matrix.length; i++) {
        let column = matrix[i];
        let columnLength = column.length;
        if (columnLength >= exports.MAX_MATRIX_COLUMN_LENGTH) {
            throw new Error(`Matrix column length (${columnLength}) cannot exceed ${exports.MAX_MATRIX_COLUMN_LENGTH}`);
        }
        for (let j = 0; j < columnLength; j++) {
            size += column[j].length;
        }
    }
    return size;
}
//# sourceMappingURL=sizeof.js.map