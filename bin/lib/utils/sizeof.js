"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const merkle_1 = require("@guildofweavers/merkle");
// MODULE VARIABLES
// ================================================================================================
exports.MAX_ARRAY_LENGTH = 256;
// PUBLIC FUNCTIONS
// ================================================================================================
function sizeOf(proof, valueSize, hashAlgorithm) {
    const nodeSize = merkle_1.getHashDigestSize(hashAlgorithm);
    let size = 0;
    // evaluations
    size += nodeSize; // root
    const evData = sizeOfArray(proof.evaluations.values, valueSize);
    const evProof = sizeOfMatrix(proof.evaluations.nodes, nodeSize);
    size += 1; // evaluation proof depth
    size += 1; // boundary poly count
    size += evData + evProof;
    // degree
    size += nodeSize; // root
    const lcProof = sizeOfMerkleProof(proof.degree.lcProof, nodeSize);
    let ldProof = 1; // ld component count
    for (let i = 0; i < proof.degree.ldProof.components.length; i++) {
        let component = proof.degree.ldProof.components[i];
        ldProof += nodeSize; // column root
        ldProof += sizeOfMerkleProof(component.columnProof, nodeSize);
        ldProof += sizeOfMerkleProof(component.polyProof, nodeSize);
    }
    ldProof += sizeOfArray(proof.degree.ldProof.remainder, nodeSize);
    size += lcProof + ldProof;
    return { evData, evProof, lcProof, ldProof, total: size };
}
exports.sizeOf = sizeOf;
function sizeOfMerkleProof(proof, nodeSize) {
    let size = 0;
    size += sizeOfArray(proof.values, nodeSize);
    size += sizeOfMatrix(proof.nodes, nodeSize);
    size += 1; // tree depth
    return size;
}
exports.sizeOfMerkleProof = sizeOfMerkleProof;
// HELPER FUNCTIONS
// ================================================================================================
function sizeOfArray(array, elementSize) {
    if (array.length > exports.MAX_ARRAY_LENGTH) {
        throw new Error(`Array length (${array.length}) cannot exceed ${exports.MAX_ARRAY_LENGTH}`);
    }
    let size = 1; // 1 byte for array length
    size += array.length * elementSize;
    return size;
}
function sizeOfMatrix(matrix, elementSize) {
    if (matrix.length > exports.MAX_ARRAY_LENGTH) {
        throw new Error(`Matrix column count (${matrix.length}) cannot exceed ${exports.MAX_ARRAY_LENGTH}`);
    }
    let size = 1; // 1 byte for number of columns
    size += matrix.length; // 1 byte for length of each column
    for (let i = 0; i < matrix.length; i++) {
        let columnLength = matrix[i].length;
        if (columnLength >= exports.MAX_ARRAY_LENGTH) {
            throw new Error(`Matrix column length (${columnLength}) cannot exceed ${exports.MAX_ARRAY_LENGTH - 1}`);
        }
        size += (columnLength * elementSize);
    }
    return size;
}
//# sourceMappingURL=sizeof.js.map