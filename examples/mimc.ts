// IMPORTS
// ================================================================================================
import * as assert from 'assert';
import { Stark, PrimeField } from '../index';
import { ExecutionFrame, EvaluationFrame, ConstantPattern } from '@guildofweavers/genstark';

// STARK DEFINITION
// ================================================================================================
// define a filed in which we'll be working
const modulus = 2n ** 256n - 351n * 2n ** 32n + 1n;
const field = new PrimeField(modulus);

// define round constants
const roundConstants = new Array<bigint>(64);
for (let i = 0; i < 64; i++) {
  roundConstants[i] = (BigInt(i)**7n) ^ 42n;
}
roundConstants.push(roundConstants.shift()!); // moves first element to the end of the array

// define state transition function for Fibonacci sequence
function mimcTransition(frame: ExecutionFrame) {
    const v = frame.getValue(0);        // get current state for register 0
    const k = frame.getConst(0);        // get current state for constant 0

    // nv = v**3 + k
    const nv = frame.add(frame.exp(v, 3n), k);
   
    // set the next state
    frame.setNextValue(0, nv);
}

// define constraint checking function for Fibonacci sequence
function mimcConstraint(frame: EvaluationFrame) {
    const v = frame.getValue(0);        // get current state from register 0
    const k = frame.getConst(0);        // get current state from constant 0
    const nv = frame.getNextValue(0);   // get next state from register 0

    // compute: nv - (v**3 + k)
    return frame.sub(nv, frame.add(frame.exp(v, 3n), k));
}

// create the STARK
const mimcStark = new Stark({
    field               : field,
    registerCount       : 1,                        // we only need 1 register
    constantCount       : 1,                        // we only need 1 constant
    tFunction           : mimcTransition,
    tConstraints        : [mimcConstraint],
    tConstraintDegree   : 3                         // max degree of our constraints is 3
});

// TESTING
// ================================================================================================
//let steps = 2**6, result = 9914111340415884043948336932125607009898172855472046712041631397117371370947n;
let steps = 2**13, result = 96345324969343526422260520803046722547231286139219056412019778618197922562726n;

const inputs = [3n];
const constants = [{ values: roundConstants, pattern: ConstantPattern.repeat }];
const assertions = [{ step: 0, register: 0, value: 3n }, { step: steps-1, register: 0, value: result }];
let proof = mimcStark.prove(assertions, steps, inputs, constants);
console.log('-'.repeat(100));

let start = Date.now();
const buf = mimcStark.serialize(proof);
console.log(`Proof serialized in ${Date.now() - start} ms`);
console.log(`Proof size: ${Math.round(buf.byteLength / 1024 * 100) / 100} KB`);
assert(buf.byteLength === mimcStark.sizeOf(proof));
console.log('-'.repeat(100));

start = Date.now();
proof = mimcStark.parse(buf);
console.log(`Proof parsed in ${Date.now() - start} ms`);
console.log('-'.repeat(100));

mimcStark.verify(assertions, proof, steps, constants);
console.log('-'.repeat(100));