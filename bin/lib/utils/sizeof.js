"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// MODULE VARIABLES
// ================================================================================================
exports.MAX_ARRAY_LENGTH = 256;
exports.MAX_MATRIX_COLUMN_LENGTH = 127;
// PUBLIC FUNCTIONS
// ================================================================================================
function sizeOf(proof, hashDigestSize) {
    let size = 0;
    // evData
    let evData = 1; // length of values array
    for (let value of proof.values) {
        evData += value.byteLength;
    }
    size += evData;
    // evProof
    let evProof = hashDigestSize; // root
    evProof += sizeOfMatrix(proof.evProof.nodes);
    evProof += 1; // evaluation proof depth
    size += evProof;
    // lcProof
    let lcProof = hashDigestSize; // root;
    lcProof += sizeOfMatrix(proof.lcProof.nodes);
    lcProof += 1; // linear combination proof depth
    size += lcProof;
    // ldProof
    let ldProof = 1; // ld component count
    for (let i = 0; i < proof.ldProof.components.length; i++) {
        let component = proof.ldProof.components[i];
        ldProof += hashDigestSize; // column root
        ldProof += sizeOfMerkleProof(component.columnProof);
        ldProof += sizeOfMerkleProof(component.polyProof);
    }
    ldProof += sizeOfArray(proof.ldProof.remainder);
    size += ldProof;
    return { evData, evProof, lcProof, ldProof, total: size };
}
exports.sizeOf = sizeOf;
function sizeOfMerkleProof(proof) {
    let size = 0;
    size += sizeOfArray(proof.values);
    size += sizeOfMatrix(proof.nodes);
    size += 1; // tree depth
    return size;
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