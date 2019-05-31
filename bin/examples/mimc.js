"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const assert = require("assert");
const index_1 = require("../index");
// STARK DEFINITION
// ================================================================================================
// define round constants
const roundConstants = new Array(64);
for (let i = 0; i < 64; i++) {
    roundConstants[i] = (BigInt(i) ** 7n) ^ 42n;
}
// create the STARK for MiMC computation
const mimcStark = new index_1.Stark({
    field: new index_1.PrimeField(2n ** 256n - 351n * 2n ** 32n + 1n),
    tExpressions: {
        'n0': 'r0^3 + k0'
    },
    tConstraints: [
        'n0 - (r0^3 + k0)'
    ],
    tConstraintDegree: 3,
    constants: [{
            values: roundConstants,
            pattern: 'repeat'
        }]
});
// TESTING
// ================================================================================================
//const steps = 2**6, result = 115147868172009559599970888602262339785331471694954098733392001040646413813295n; // ~100 ms, ~46 KB
const steps = 2 ** 13, result = 95224774355499767951968048714566316597785297695903697235130434363122555476056n; // ~4.5 sec, ~220 KB
//const steps = 2**17, result = 47923185371606372287465305238563325603777484372847211522043297561219208703471n; // ~72 sec, ~394 KB
// set up inputs and assertions
const inputs = [3n]; // we need to provide starting value for 1 register
const assertions = [
    { step: 0, register: 0, value: inputs[0] },
    { step: steps - 1, register: 0, value: result } // value at last step is equal to result
];
// prove that the assertions hold if we execute MiMC computation for the given number of steps
let proof = mimcStark.prove(assertions, steps, inputs);
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
mimcStark.verify(assertions, proof, steps);
console.log('-'.repeat(20));
//# sourceMappingURL=mimc.js.map