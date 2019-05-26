"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const sizeof_1 = require("./sizeof");
// PUBLIC FUNCTIONS
// ================================================================================================
function readMerkleProof(buffer, offset, nodeSize) {
    const valuesInfo = readArray(buffer, offset, nodeSize);
    offset = valuesInfo.offset;
    const nodesInfo = readMatrix(buffer, offset, nodeSize);
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
function readMatrix(buffer, offset, elementSize) {
    const columnCount = buffer.readUInt8(offset) || sizeof_1.MAX_ARRAY_LENGTH; // 0 means 256
    offset += 1;
    const matrix = new Array(columnCount);
    for (let i = 0; i < columnCount; i++, offset += 1) {
        matrix[i] = new Array(buffer.readUInt8(offset));
    }
    for (let i = 0; i < columnCount; i++) {
        let column = matrix[i];
        for (let j = 0; j < column.length; j++) {
            column[j] = Buffer.allocUnsafe(elementSize);
            offset += buffer.copy(column[j], 0, offset, offset + elementSize);
        }
    }
    return { matrix, offset };
}
exports.readMatrix = readMatrix;
//# sourceMappingURL=readers.js.map