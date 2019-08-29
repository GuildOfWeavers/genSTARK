"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const inliners = require("./inliners");
// RE-EXPORTS
// ================================================================================================
var serialization_1 = require("./serialization");
exports.writeMerkleProof = serialization_1.writeMerkleProof;
exports.readMerkleProof = serialization_1.readMerkleProof;
exports.writeMatrix = serialization_1.writeMatrix;
exports.readMatrix = serialization_1.readMatrix;
exports.writeArray = serialization_1.writeArray;
exports.readArray = serialization_1.readArray;
var sizeof_1 = require("./sizeof");
exports.sizeOf = sizeof_1.sizeOf;
var Logger_1 = require("./Logger");
exports.Logger = Logger_1.Logger;
exports.inline = inliners;
// CONSTANTS
// ================================================================================================
const MASK_64B = 0xffffffffffffffffn;
// MATH
// ================================================================================================
function isPowerOf2(value) {
    if (typeof value === 'bigint') {
        return (value !== 0n) && (value & (value - 1n)) === 0n;
    }
    else {
        return (value !== 0) && (value & (value - 1)) === 0;
    }
}
exports.isPowerOf2 = isPowerOf2;
function powLog2(base, exponent) {
    let twos = 0;
    while (exponent % 2 === 0) {
        twos++;
        exponent = exponent / 2;
    }
    return (2 ** twos) * Math.log2(base ** exponent);
}
exports.powLog2 = powLog2;
// BIGINT-BUFFER CONVERSIONS
// ================================================================================================
function readBigInt(buffer, offset, elementSize) {
    const blocks = elementSize >> 3;
    let value = 0n;
    for (let i = 0n; i < blocks; i++) {
        value = (buffer.readBigUInt64LE(offset) << (64n * i)) | value;
        offset += 8;
    }
    return value;
}
exports.readBigInt = readBigInt;
function writeBigInt(value, buffer, offset, elementSize) {
    const limbCount = elementSize >> 3;
    for (let i = 0; i < limbCount; i++) {
        buffer.writeBigUInt64LE(value & MASK_64B, offset);
        value = value >> 64n;
        offset += 8;
    }
    return offset;
}
exports.writeBigInt = writeBigInt;
// OTHER
// ================================================================================================
function noop() { }
exports.noop = noop;
;
//# sourceMappingURL=index.js.map