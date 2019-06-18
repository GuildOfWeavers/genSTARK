// IMPORTS
// ================================================================================================
import * as assert from 'assert';
import { Stark, PrimeField } from '../index';

// STARK DEFINITION
// ================================================================================================
//const steps = 2**6, result = 115147868172009559599970888602262339785331471694954098733392001040646413813295n;
const steps = 2**13, result = 95224774355499767951968048714566316597785297695903697235130434363122555476056n;
//const steps = 2**17, result = 47923185371606372287465305238563325603777484372847211522043297561219208703471n;

// define round constants
const roundConstants = new Array<bigint>(64);
for (let i = 0; i < 64; i++) {
  roundConstants[i] = (BigInt(i)**7n) ^ 42n;
}

// create the STARK for MiMC computation
const mimcStark = new Stark(`
define MiMC over prime field (2^256 - 351 * 2^32 + 1) {

    transition 1 register in 2^13 steps {
        out: $r0^3 + $k0;
    }

    enforce 1 constraint of degree 3 {
        out: $n0 - ($r0^3 + $k0);
    }

    using 1 readonly register {
        $k0: repeat [${roundConstants.join(', ')}];
    }
}`);

// TESTING
// ================================================================================================
// set up inputs and assertions
const inputs = [3n];                                    // we need to provide starting value for 1 register
const assertions = [
    { step: 0, register: 0, value: inputs[0] },         // value at first step is equal to input
    { step: steps - 1, register: 0, value: result }     // value at last step is equal to result
];

// prove that the assertions hold if we execute MiMC computation with given inputs
let proof = mimcStark.prove(assertions, inputs);
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