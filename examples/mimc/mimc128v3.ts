// IMPORTS
// ================================================================================================
import * as assert from 'assert';
import { StarkOptions, FiniteField } from '@guildofweavers/genstark';
import { instantiateScript } from '../../index';
import { Logger } from '../../lib/utils';
import { prng } from '@guildofweavers/air-assembly';

// STARK DEFINITION
// ================================================================================================
const steps = 2**13;
const constantCount = 64;
const seed = 3n;

// define security options for the STARK
const options: StarkOptions = {
    hashAlgorithm   : 'blake2s256',
    extensionFactor : 16,
    exeQueryCount   : 48,
    friQueryCount   : 24,
    wasm            : true
};

// create the STARK for MiMC computation
// TODO: update
const mimcStark = instantiateScript(Buffer.from(`
define MiMC over prime field (2^128 - 9 * 2^32 + 1) {

    const alpha: 3;
    
    static roundConstant: cycle [
        42, 43, 170, 2209, 16426, 78087, 279978, 823517, 2097194, 4782931,
        10000042, 19487209, 35831850, 62748495, 105413546, 170859333
    ];

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

}`
), options, new Logger(false));

// TESTING
// ================================================================================================
// generate control values
const controls = runMimc(mimcStark.air.field, steps, constantCount, seed);

// set up inputs and assertions
const assertions = [
    { step: 0, register: 0, value: controls[0] },                   // value at first step is equal to input
    { step: steps - 1, register: 0, value: controls[steps - 1] }    // value at last step is equal to result
];

// prove that the assertions hold if we execute MiMC computation with given inputs
let proof = mimcStark.prove(assertions, [[seed]], [seed]);
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
function runMimc(field: FiniteField, steps: number, constCount: number, seed: bigint): bigint[] {
    // build round constants
    const roundConstants = [
        42n, 43n, 170n, 2209n, 16426n, 78087n, 279978n, 823517n, 2097194n, 4782931n,
        10000042n, 19487209n, 35831850n, 62748495n, 105413546n, 170859333n
    ];

    const result = [seed];
    for (let i = 0; i < steps - 1; i++) {
        let value = field.add(field.exp(result[i], 3n), roundConstants[i % roundConstants.length]);
        result.push(value);
    }

    return result;
}