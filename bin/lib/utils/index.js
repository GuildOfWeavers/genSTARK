"use strict";
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
const inliners = require("./inliners");
// RE-EXPORTS
// ================================================================================================
__export(require("./serialization"));
var sizeof_1 = require("./sizeof");
exports.sizeOf = sizeof_1.sizeOf;
var Logger_1 = require("./Logger");
exports.Logger = Logger_1.Logger;
exports.inline = inliners;
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
// MERKLE PROOF
// ================================================================================================
function rehashMerkleProofValues(proof, hash) {
    const hashedValues = new Array(proof.values.length);
    for (let i = 0; i < hashedValues.length; i++) {
        hashedValues[i] = hash.digest(proof.values[i]);
    }
    return {
        nodes: proof.nodes,
        values: hashedValues,
        depth: proof.depth
    };
}
exports.rehashMerkleProofValues = rehashMerkleProofValues;
// OTHER
// ================================================================================================
function noop() { }
exports.noop = noop;
;
//# sourceMappingURL=index.js.map