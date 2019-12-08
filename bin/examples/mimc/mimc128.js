"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const assert = require("assert");
const index_1 = require("../../index");
const utils_1 = require("../../lib/utils");
const air_assembly_1 = require("@guildofweavers/air-assembly");
// STARK DEFINITION
// ================================================================================================
const steps = 2 ** 13;
const constantCount = 64;
const seed = 3n;
// define security options for the STARK
const options = {
    hashAlgorithm: 'blake2s256',
    extensionFactor: 16,
    exeQueryCount: 48,
    friQueryCount: 24
};
// create the STARK for MiMC computation
const mimcStark = index_1.createStark(Buffer.from(`
(module
    (field prime 340282366920938463463374607393113505793)
    (const 
        (scalar 3))
    (static
        (cycle (prng sha256 0x4d694d43 ${constantCount})))
    (transition
        (span 1) (result vector 1)
        (add 
            (exp (load.trace 0) (load.const 0))
            (get (load.static 0) 0)))
    (evaluation
        (span 2) (result vector 1)
        (sub
            (load.trace 1)
            (add
                (exp (load.trace 0) (load.const 0))
                (get (load.static 0) 0))))
    (export main (init seed) (steps ${steps})))`), options, true, new utils_1.Logger(false));
// TESTING
// ================================================================================================
// generate control values
const controls = runMimc(mimcStark.air.field, steps, constantCount, seed);
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
// MiMC FUNCTION
// ================================================================================================
function runMimc(field, steps, constCount, seed) {
    // build round constants
    const roundConstants = air_assembly_1.prng.sha256(Buffer.from('4d694d43', 'hex'), constCount, field);
    const result = [seed];
    for (let i = 0; i < steps - 1; i++) {
        let value = field.add(field.exp(result[i], 3n), roundConstants[i % roundConstants.length]);
        result.push(value);
    }
    return result;
}
//# sourceMappingURL=mimc128.js.map