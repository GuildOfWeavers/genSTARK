"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const assert = require("assert");
const index_1 = require("../index");
// STARK DEFINITION
// ================================================================================================
//const modulus = 96769n;
const modulus = 2n ** 256n - 351n * 2n ** 32n + 1n;
const mimcstark = new index_1.Stark({
    field: new index_1.PrimeField(modulus),
    registerCount: 1,
    constantCount: 1,
    tFunction: mimcTransition,
    tConstraints: [mimcConstraint],
    tConstraintDegree: 3
});
function mimcTransition(frame, field) {
    const v = frame.getValue(0);
    const k = frame.getConst(0);
    // nv = v**3 + k
    const nv = field.add(field.exp(v, 3n), k);
    frame.setNextValue(0, nv);
}
function mimcConstraint(frame, field) {
    const v = frame.getValue(0);
    const k = frame.getConst(0);
    const nv = frame.getNextValue(0);
    return field.sub(nv, field.add(field.exp(v, 3n), k));
}
const roundConstants = new Array(64);
for (let i = 0; i < 64; i++) {
    roundConstants[i] = (BigInt(i) ** 7n) ^ 42n;
}
roundConstants.push(roundConstants.shift()); // moves first element to the end of the array
// TESTING
// ================================================================================================
//let steps = 2**6, result = 9914111340415884043948336932125607009898172855472046712041631397117371370947n;
let steps = 2 ** 13, result = 96345324969343526422260520803046722547231286139219056412019778618197922562726n;
const inputs = [3n];
const constants = [{ values: roundConstants, pattern: 1 /* repeat */ }];
const assertions = [{ step: 0, register: 0, value: 3n }, { step: steps - 1, register: 0, value: result }];
let proof = mimcstark.prove(assertions, steps, inputs, constants);
console.log('-'.repeat(100));
let start = Date.now();
const buf = mimcstark.serialize(proof);
console.log(`Proof serialized in ${Date.now() - start} ms`);
console.log(`Proof size: ${Math.round(buf.byteLength / 1024 * 100) / 100} KB`);
assert(buf.byteLength === mimcstark.sizeOf(proof));
console.log('-'.repeat(100));
start = Date.now();
proof = mimcstark.parse(buf);
console.log(`Proof parsed in ${Date.now() - start} ms`);
console.log('-'.repeat(100));
mimcstark.verify(assertions, proof, steps, constants);
console.log('-'.repeat(100));
//# sourceMappingURL=mimc.js.map