"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const crypto = require("crypto");
// RE-EXPORTS
// ================================================================================================
var serializaton_1 = require("./serializaton");
exports.writeMerkleProof = serializaton_1.writeMerkleProof;
exports.readMerkleProof = serializaton_1.readMerkleProof;
exports.writeMatrix = serializaton_1.writeMatrix;
exports.readMatrix = serializaton_1.readMatrix;
exports.writeArray = serializaton_1.writeArray;
exports.readArray = serializaton_1.readArray;
var sizeof_1 = require("./sizeof");
exports.sizeOf = sizeof_1.sizeOf;
var Logger_1 = require("./Logger");
exports.Logger = Logger_1.Logger;
// PUBLIC FUNCTIONS
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
function getPseudorandomIndexes(seed, count, max, excludeMultiplesOf = 0) {
    const modulus = BigInt(max);
    const skip = BigInt(excludeMultiplesOf);
    const indexes = new Set();
    // TODO: improve
    let seed2 = sha256(seed);
    while (indexes.size < count) {
        seed2 = sha256(seed2);
        let index = seed2 % modulus;
        if (skip && index % skip === 0n)
            continue;
        if (indexes.has(index))
            continue;
        indexes.add(index);
    }
    const result = [];
    for (let index of indexes) {
        result.push(Number.parseInt(index.toString(16), 16));
    }
    return result;
}
exports.getPseudorandomIndexes = getPseudorandomIndexes;
function bigIntsToBuffers(values, size) {
    const result = new Array(values.length);
    const maxValue = 2n ** BigInt(size * 8);
    const hexSize = size * 2;
    for (let i = 0; i < values.length; i++) {
        let v = values[i];
        if (v >= maxValue) {
            throw Error('Cannot convert bigint to buffer: value is too large');
        }
        result[i] = Buffer.from(v.toString(16).padStart(hexSize, '0'), 'hex');
    }
    return result;
}
exports.bigIntsToBuffers = bigIntsToBuffers;
function buffersToBigInts(values) {
    const result = new Array(values.length);
    for (let i = 0; i < values.length; i++) {
        result[i] = BigInt('0x' + values[i].toString('hex'));
    }
    return result;
}
exports.buffersToBigInts = buffersToBigInts;
function sha256(value) {
    const buffer = (typeof value === 'bigint')
        ? Buffer.from(value.toString(16), 'hex')
        : value;
    const hash = crypto.createHash('sha256').update(buffer);
    return BigInt('0x' + hash.digest().toString('hex'));
}
exports.sha256 = sha256;
//# sourceMappingURL=index.js.map