// IMPORTS
// ================================================================================================
import * as assert from 'assert';
import { StarkOptions } from '@guildofweavers/genstark';
import { createPrimeField } from '@guildofweavers/galois';
import { prng } from '@guildofweavers/air-assembly';
import { instantiateScript } from '../../index';
import { Logger, inline } from '../../lib/utils';
import { runMimc } from './utils';

// MIMC PARAMETERS
// ================================================================================================
const modulus = 2n**256n - 351n * 2n**32n + 1n;
const field = createPrimeField(modulus);
const roundConstants = prng.sha256(Buffer.from('4d694d43', 'hex'), 64, field);
const steps = 2**13;
const seed = 3n;

// STARK DEFINITION
// ================================================================================================
// define security options for the STARK
const options: StarkOptions = {
    hashAlgorithm   : 'blake2s256',
    extensionFactor : 16,
    exeQueryCount   : 40,
    friQueryCount   : 24,
    wasm            : true
};

// create the STARK for MiMC computation
const mimcStark = instantiateScript(Buffer.from(`
define MiMC over prime field (${modulus}) {

    const alpha: 3;
    
    static roundConstant: cycle ${inline.vector(roundConstants)};

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

}`), options, new Logger(false));

// TESTING
// ================================================================================================
// generate control values
const controls = runMimc(mimcStark.air.field, steps, roundConstants, seed);

// set up inputs and assertions
const assertions = [
    { step: 0, register: 0, value: controls[0] },                   // value at first step is equal to input
    { step: steps - 1, register: 0, value: controls[steps - 1] }    // value at last step is equal to result
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