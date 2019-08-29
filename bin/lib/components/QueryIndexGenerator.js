"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const crypto = require("crypto");
// CLASS DEFINITION
// ================================================================================================
class QueryIndexGenerator {
    constructor(options) {
        this.extensionFactor = options.extensionFactor;
        this.exeQueryCount = options.exeQueryCount;
        this.friQueryCount = options.friQueryCount;
    }
    getExeIndexes(seed, domainSize) {
        const queryCount = Math.min(this.exeQueryCount, domainSize - domainSize / this.extensionFactor);
        return getPseudorandomIndexes(seed, queryCount, domainSize, this.extensionFactor);
    }
    getFriIndexes(seed, columnLength) {
        return getPseudorandomIndexes(seed, this.friQueryCount, columnLength, this.extensionFactor);
    }
}
exports.QueryIndexGenerator = QueryIndexGenerator;
// HELPER FUNCTIONS
// ================================================================================================
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
function sha256(value) {
    const buffer = (typeof value === 'bigint')
        ? Buffer.from(value.toString(16), 'hex')
        : value;
    const hash = crypto.createHash('sha256').update(buffer);
    return BigInt('0x' + hash.digest().toString('hex'));
}
//# sourceMappingURL=QueryIndexGenerator.js.map