"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const assert = require("assert");
const galois_1 = require("@guildofweavers/galois");
const air_assembly_1 = require("@guildofweavers/air-assembly");
const index_1 = require("../../index");
const utils_1 = require("../../lib/utils");
const utils_2 = require("./utils");
// MIMC PARAMETERS
// ================================================================================================
const modulus = 2n ** 128n - 9n * 2n ** 32n + 1n;
const field = galois_1.createPrimeField(modulus);
const roundConstants = air_assembly_1.prng.sha256(Buffer.from('4d694d43', 'hex'), 64, field);
const steps = 2 ** 13;
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
const mimcStark = index_1.instantiateScript(Buffer.from(`
define MiMC over prime field (${modulus}) {

    const alpha: 3;
    
    static roundConstant: cycle ${utils_1.inline.vector(roundConstants)};

    secret input startValue: element[1];

    // transition function definition
    transition 1 register {
        for each (startValue) {
            init { yield startValue; }

            for steps [1..${steps - 1}] {
                yield $r0^3 + roundConstant;
            }
        }
    }

    // transition constraint definition
    enforce 1 constraint {
        for all steps {
            enforce transition($r) = $n;
        }
    }

}`), options, new utils_1.Logger(false));
// TESTING
// ================================================================================================
// generate control values
const controls = utils_2.runMimc(mimcStark.air.field, steps, roundConstants, seed);
// set up inputs and assertions
const assertions = [
    { step: 0, register: 0, value: controls[0] },
    { step: steps - 1, register: 0, value: controls[steps - 1] } // value at last step is equal to result
];
// prove that the assertions hold if we execute MiMC computation with given inputs
let proof = mimcStark.prove(assertions, [[seed]]);
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