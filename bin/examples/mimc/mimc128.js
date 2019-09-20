"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const assert = require("assert");
const index_1 = require("../../index");
const utils_1 = require("../../lib/utils");
// STARK DEFINITION
// ================================================================================================
//const steps = 2**6, result = 285985527232340595584273426051826821023n;
//const steps = 2**13, result = 147825736855841423522558179849475373187n;
const steps = 2 ** 17, result = 258147208663839268890169448829281413476n;
//const steps = 2**20, result = 329756792803476935518229231243182527856n;
// define round constants
const roundConstants = new Array(64);
for (let i = 0; i < 64; i++) {
    roundConstants[i] = (BigInt(i) ** 7n) ^ 42n;
}
// define security options for the STARK
const securityOptions = {
    hashAlgorithm: 'blake2s256',
    extensionFactor: 16,
    exeQueryCount: 40,
    friQueryCount: 24
};
// create the STARK for MiMC computation
const mimcStark = new index_1.Stark(`
define MiMC over prime field (2^128 - 9 * 2^32 + 1) {

    transition 1 register in ${steps} steps {
        out: $r0^3 + $k0;
    }

    enforce 1 constraint {
        out: $n0 - ($r0^3 + $k0);
    }

    using 1 readonly register {
        $k0: repeat [${roundConstants.join(', ')}];
    }
}`, securityOptions, { initialMemory: 512 * 2 ** 20 }, new utils_1.Logger(false));
// TESTING
// ================================================================================================
// set up inputs and assertions
const initValues = [3n]; // we need to provide starting value for 1 register
const assertions = [
    { step: 0, register: 0, value: initValues[0] },
    { step: steps - 1, register: 0, value: result } // value at last step is equal to result
];
// prove that the assertions hold if we execute MiMC computation with given inputs
let proof = mimcStark.prove(assertions, initValues);
console.log('-'.repeat(20));
// serialize the proof
let start = Date.now();
const buf = mimcStark.serialize(proof);
console.log(`Proof serialized in ${Date.now() - start} ms; size: ${Math.round(buf.byteLength / 1024 * 100) / 100} KB`);
assert(buf.byteLength === mimcStark.sizeOf(proof));
console.log('-'.repeat(20));
// deserialize the proof to make sure everything serialized correctly
start = Date.now();
proof = mimcStark.parse(buf);
console.log(`Proof parsed in ${Date.now() - start} ms`);
console.log('-'.repeat(20));
// verify the proof
mimcStark.verify(assertions, proof);
console.log('-'.repeat(20));
console.log(`STARK security level: ${mimcStark.securityLevel}`);
//# sourceMappingURL=mimc128.js.map