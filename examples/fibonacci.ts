// IMPORTS
// ================================================================================================
import * as assert from 'assert';
import { Stark, PrimeField, script } from '../index';

// STARK DEFINITION
// ================================================================================================
// This example shows how to create a STARK to verify computation of Fibonacci numbers. Because a
// Fibonacci number depends on 2 values preceding it, we set up the STARK with 2 mutable registers
// holding 2 consecutive Fibonacci numbers. So, in effect, a single step in the computation
// advances the Fibonacci sequence by 2 values.

const fibStark = new Stark({
    field: new PrimeField(2n**32n - 3n * 2n**25n + 1n),
    tExpressions: {
        [script]: 'a0: r0 + r1',
        'n0': 'a0',
        'n1': 'r1 + a0'
    },
    tConstraints: {
        [script]: 'a0: r0 + r1',
        'q0': 'n0 - a0',
        'q1': 'n1 - (r1 + a0)'
    },
    tConstraintDegree: 1 // max degree of our constraints is 1
});

// TESTING
// ================================================================================================
//const steps = 2**6, result = 1783540607n;         // ~50 ms to prove, ~12 KB proof size
const steps = 2**13, result = 203257732n;           // ~1 second to prove, ~147 KB proof size
//const steps = 2**17, result = 2391373091n;        // ~13 seconds to prove, ~290 KB proof size

// set up inputs and assertions
const inputs = [1n, 1n];                            // step 0 and 1 in Fibonacci sequence are 1
const assertions = [
    { step: 0, register: 0, value: 1n },            // value at the first step is 1
    { step: 0, register: 1, value: 1n },            // value at the second step is 1
    { step: steps-1, register: 1, value: result }   // value at the last step is equal to result
];

// prove that the assertions hold if we execute Fibonacci computation for the given number of steps
let proof = fibStark.prove(assertions, steps, inputs);
console.log('-'.repeat(20));

// serialize the proof
let start = Date.now();
const buf = fibStark.serialize(proof);
console.log(`Proof serialized in ${Date.now() - start} ms; size: ${Math.round(buf.byteLength / 1024 * 100) / 100} KB`);
assert(buf.byteLength === fibStark.sizeOf(proof));
console.log('-'.repeat(20));

// deserialize the proof to make sure everything serialized correctly
start = Date.now();
proof = fibStark.parse(buf);
console.log(`Proof parsed in ${Date.now() - start} ms`);
console.log('-'.repeat(20));

// verify the proof
fibStark.verify(assertions, proof, steps);
console.log('-'.repeat(20));