"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sizeof_1 = require("./sizeof");
// MERKLE PROOFS
// ================================================================================================
function writeMerkleProof(buffer, offset, proof, leafSize) {
    offset = writeArray(buffer, offset, proof.values);
    offset = writeMatrix(buffer, offset, proof.nodes, leafSize);
    offset = buffer.writeUInt8(proof.depth, offset);
    return offset;
}
exports.writeMerkleProof = writeMerkleProof;
function readMerkleProof(buffer, offset, leafSize, nodeSize) {
    const valuesInfo = readArray(buffer, offset, leafSize);
    offset = valuesInfo.offset;
    const nodesInfo = readMatrix(buffer, offset, leafSize, nodeSize);
    offset = nodesInfo.offset;
    const depth = buffer.readUInt8(offset);
    offset += 1;
    const proof = {
        values: valuesInfo.values,
        nodes: nodesInfo.matrix,
        depth: depth
    };
    return { proof, offset };
}
exports.readMerkleProof = readMerkleProof;
// ARRAYS
// ================================================================================================
function writeArray(buffer, offset, array) {
    // 1 byte for the array size (max 256 is written as 0)
    offset = buffer.writeUInt8(array.length === sizeof_1.MAX_ARRAY_LENGTH ? 0 : array.length, offset);
    for (let i = 0; i < array.length; i++) {
        offset += array[i].copy(buffer, offset);
    }
    return offset;
}
exports.writeArray = writeArray;
function readArray(buffer, offset, elementSize) {
    const arrayLength = buffer.readUInt8(offset) || sizeof_1.MAX_ARRAY_LENGTH; // 0 means 256
    offset += 1;
    const values = new Array(arrayLength);
    for (let i = 0; i < arrayLength; i++) {
        values[i] = Buffer.allocUnsafe(elementSize);
        offset += buffer.copy(values[i], 0, offset, offset + elementSize);
    }
    return { values, offset };
}
exports.readArray = readArray;
// MATRIXES
// ================================================================================================
function writeMatrix(buffer, offset, matrix, leafSize) {
    // 1 byte for the number of columns (max 256 written as 0)
    offset = buffer.writeUInt8(matrix.length === sizeof_1.MAX_ARRAY_LENGTH ? 0 : matrix.length, offset);
    // then write lengths and value type of each column (1 byte each, max 255)
    for (let i = 0; i < matrix.length; i++) {
        let column = matrix[i];
        let length = column.length;
        // column type is stored as least significant bit
        let type = (length > 0 && column[0].byteLength === leafSize)
            ? 1 /* leaf */
            : 0 /* node */;
        offset = buffer.writeUInt8((length << 1) | type, offset);
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
function readMatrix(buffer, offset, leafSize, nodeSize) {
    const columnCount = buffer.readUInt8(offset) || sizeof_1.MAX_ARRAY_LENGTH; // 0 means 256
    offset += 1;
    const matrix = new Array(columnCount);
    const columnTypes = new Array(columnCount);
    for (let i = 0; i < columnCount; i++, offset += 1) {
        let lengthAndType = buffer.readUInt8(offset);
        matrix[i] = new Array(lengthAndType >>> 1);
        columnTypes[i] = lengthAndType & 1;
    }
    let elementSize;
    for (let i = 0; i < columnCount; i++) {
        let column = matrix[i];
        // set first element type based on column type
        let firstElementSize = columnTypes[i] === 1 /* leaf */ ? leafSize : nodeSize;
        for (let j = 0; j < column.length; j++) {
            elementSize = (j === 0) ? firstElementSize : nodeSize;
            column[j] = Buffer.allocUnsafe(elementSize);
            offset += buffer.copy(column[j], 0, offset, offset + elementSize);
        }
    }
    return { matrix, offset };
}
exports.readMatrix = readMatrix;
//# sourceMappingURL=serialization.js.map