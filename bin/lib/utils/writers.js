"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sizeof_1 = require("./sizeof");
// PUBLIC FUNCTIONS
// ================================================================================================
function writeMerkleProof(buffer, offset, proof, nodeSize) {
    offset = writeArray(buffer, offset, proof.values);
    offset = writeMatrix(buffer, offset, proof.nodes);
    offset = buffer.writeUInt8(proof.depth, offset);
    return offset;
}
exports.writeMerkleProof = writeMerkleProof;
function writeArray(buffer, offset, array) {
    // 1 byte for the array size (max 256 is written as 0)
    offset = buffer.writeUInt8(array.length === sizeof_1.MAX_ARRAY_LENGTH ? 0 : array.length, offset);
    for (let i = 0; i < array.length; i++) {
        offset += array[i].copy(buffer, offset);
    }
    return offset;
}
exports.writeArray = writeArray;
function writeMatrix(buffer, offset, matrix) {
    // 1 byte for the number of columns (max 256 written as 0)
    offset = buffer.writeUInt8(matrix.length === sizeof_1.MAX_ARRAY_LENGTH ? 0 : matrix.length, offset);
    // then write lengths of each column (1 byte each, max 255)
    for (let i = 0; i < matrix.length; i++) {
        offset = buffer.writeUInt8(matrix[i].length, offset);
    }
    // then write the actual values
    for (let i = 0; i < matrix.length; i++) {
        let column = matrix[i];
        for (let j = 0; j < column.length; j++) {
            offset += column[j].copy(buffer, offset);
        }
    }
    return offset;
}
exports.writeMatrix = writeMatrix;
//# sourceMappingURL=writers.js.map