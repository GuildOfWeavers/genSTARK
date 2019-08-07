"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const crypto = require("crypto");
const inliners = require("./inliners");
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
exports.inline = inliners;
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
    const maxCount = excludeMultiplesOf ? max - max / excludeMultiplesOf : max;
    if (maxCount < count)
        throw Error(`Cannot select ${count} unique pseudorandom indexes from ${max} values`);
    const maxIterations = BigInt(count * 1000);
    const modulus = BigInt(max);
    const skip = BigInt(excludeMultiplesOf);
    const indexes = new Set();
    const state = sha256(seed);
    for (let i = 0n; i < maxIterations; i++) {
        let index = sha256(state + i) % modulus;
        if (skip && index % skip === 0n)
            continue; // if the index should be excluded, skip it
        if (indexes.has(index))
            continue; // if the index is already in the list, skip it
        indexes.add(index);
        if (indexes.size >= count)
            break; // if we have enough indexes, break the loop
    }
    // if we couldn't generate enough indexes within max iterations, throw an error
    if (indexes.size < count)
        throw new Error(`Could not generate ${count} pseudorandom indexes`);
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
    if (!Array.isArray(values)) {
        values = values.toValues(); // TODO
    }
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