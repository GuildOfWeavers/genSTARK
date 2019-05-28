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

// define state transition function for MiMC computation
function mimcTransition(this: ExecutionFrame) {
    const v = this.getValue(0);        // get current state for register 0
    const k = this.getConst(0);        // get current state for constant 0

    // nv = v**3 + k
    const nv = this.add(this.exp(v, 3n), k);
   
    // set the next state for register 0
    this.setNextValue(0, nv);
}

// define constraint checking function for MiMC computation
function mimcConstraint(this: EvaluationFrame): bigint {
    const v = this.getValue(0);        // get current state from register 0
    const k = this.getConst(0);        // get current state from constant 0
    const nv = this.getNextValue(0);   // get next state from register 0

    // compute: nv - (v**3 + k)
    return this.sub(nv, this.add(this.exp(v, 3n), k));
}

// create the STARK for MiMC computation
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
//let steps = 2**6, result = 115147868172009559599970888602262339785331471694954098733392001040646413813295n;   // ~100 ms, ~48 KB
let steps = 2**13, result = 95224774355499767951968048714566316597785297695903697235130434363122555476056n;     // ~4.5 sec, ~230 KB
//let steps = 2**17, result = 47923185371606372287465305238563325603777484372847211522043297561219208703471n;   // ~72 sec, ~390 KB

// set up inputs and assertions
const inputs = [3n];                                    // we need to provide starting value for 1 register
const constants = [{                                    // we need to provide definition for 1 constant
    values: roundConstants,
    pattern: ConstantPattern.repeat                     // specify that round constants cycle during execution
}];
const assertions = [
    { step: 0, register: 0, value: inputs[0] },         // value at first step is equal to input
    { step: steps - 1, register: 0, value: result }     // value at last step is equal to result
];

// prove that the assertions hold if we execute MiMC computation
// for the given number of steps with given inputs and constants
let proof = mimcStark.prove(assertions, steps, inputs, constants);
console.log('-'.repeat(20));

// serialize the proof
let start = Date.now();
const buf = mimcStark.serialize(proof);
console.log(`Proof serialized in ${Date.now() - start} ms`);
console.log(`Proof size: ${Math.round(buf.byteLength / 1024 * 100) / 100} KB`);
assert(buf.byteLength === mimcStark.sizeOf(proof));
console.log('-'.repeat(20));

// deserialize the proof to make sure everything serialized correctly
start = Date.now();
proof = mimcStark.parse(buf);
console.log(`Proof parsed in ${Date.now() - start} ms`);
console.log('-'.repeat(20));

// verify the proof
mimcStark.verify(assertions, proof, steps, constants);
console.log('-'.repeat(20));