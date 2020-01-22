"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const assert = require("assert");
const index_1 = require("../../index");
const utils_1 = require("../../lib/utils");
const air_assembly_1 = require("@guildofweavers/air-assembly");
const utils_2 = require("./utils");
// MIMC PARAMETERS
// ================================================================================================
const steps = 2 ** 13;
const constantCount = 64;
const seed = 3n;
// STARK DEFINITION
// ================================================================================================
// define security options for the STARK
const options = {
    hashAlgorithm: 'blake2s256',
    extensionFactor: 16,
    exeQueryCount: 48,
    friQueryCount: 24,
    wasm: true
};
// create the STARK for MiMC computation
const mimcStark = index_1.instantiate(Buffer.from(`
(module
    (field prime 340282366920938463463374607393113505793)
    (const $alpha scalar 3)
    (function $mimcRound
        (result vector 1)
        (param $state vector 1) (param $roundKey scalar)
        (add 
            (exp (load.param $state) (load.const $alpha))
            (load.param $roundKey)))
    (export mimc
        (registers 1) (constraints 1) (steps ${steps})
        (static
            (cycle (prng sha256 0x4d694d43 ${constantCount})))
        (init
            (param $seed vector 1)
            (load.param $seed))
        (transition
            (call $mimcRound (load.trace 0) (get (load.static 0) 0)))
        (evaluation
            (sub
                (load.trace 1)
                (call $mimcRound (load.trace 0) (get (load.static 0) 0))))))`), 'mimc', options, new utils_1.Logger(false));
// TESTING
// ================================================================================================
// generate control values
const roundConstants = air_assembly_1.prng.sha256(Buffer.from('4d694d43', 'hex'), 64, mimcStark.air.field);
const controls = utils_2.runMimc(mimcStark.air.field, steps, roundConstants, seed);
// set up inputs and assertions
const assertions = [
    { step: 0, register: 0, value: controls[0] },
    { step: steps - 1, register: 0, value: controls[steps - 1] } // value at last step is equal to result
];
// prove that the assertions hold if we execute MiMC computation with given inputs
let proof = mimcStark.prove(assertions, [], [seed]);
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
//# sourceMappingURL=mimc128Assembly.js.map