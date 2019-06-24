"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const index_1 = require("../../index");
// STARK DEFINITION
// ================================================================================================
// This example shows how different types of constant registers can be used. The transition
// function is very simple: it operates with 1 mutable register and 2 readonly registers. The full
// execution trace is shown at the end of this file. 
//const steps = 2**6, result = 292n;
const steps = 2 ** 5, result = 21358n;
const demoStark = new index_1.Stark(`
define Demo over prime field (96769) {

    transition 1 register in 8 steps {
        out: $r0^3 + 2;
    }

    enforce 1 constraint of degree 3 {
        out: $n0 - ($r0^3 + 2);
    }
}`);
// TESTING
// ================================================================================================
function test(input) {
    const field = new index_1.PrimeField(96769n);
    const result = [input];
    for (let i = 0; i < 7; i++) {
        result.push(field.add(field.exp(result[i], 3n), 2n));
    }
    console.log(result);
}
test(1n);
test(2n);
test(3n);
test(4n);
// set up inputs and assertions
const inputs = [[1n], [2n], [3n], [4n]];
const assertions = [
    { step: 0, register: 0, value: 1n },
    { step: steps - 1, register: 0, value: result }
];
// generate a proof
const proof = demoStark.prove(assertions, inputs);
console.log('-'.repeat(20));
// verify the proof
demoStark.verify(assertions, proof, 4);
console.log('-'.repeat(20));
// EXECUTION TRACE
// ================================================================================================
// K0 is the first (repeating) constant, K1 is the second (stretched) constant, 
// V0 is the mutable register. The transition function is vNext = v0 + 1 + K0 + 2 * K1
//
//  Step	K0	K1	V0
//  0		1	1	1
//  1		2	0	5
//  2		3	0	8
//  3		4	0	12
//  4		1	0	17
//  5		2	0	19
//  6		3	0	22
//  7		4	0	26
//  8		1	2	31
//  9		2	0	37
//  10		3	0	40
//  11		4	0	44
//  12		1	0	49
//  13		2	0	51
//  14		3	0	54
//  15		4	0	58
//  16		1	3	63
//  17		2	0	71
//  18		3	0	74
//  19		4	0	78
//  20		1	0	83
//  21		2	0	85
//  22		3	0	88
//  23		4	0	92
//  24		1	4	97
//  25		2	0	107
//  26		3	0	110
//  27		4	0	114
//  28		1	0	119
//  29		2	0	121
//  30		3	0	124
//  31		4	0	128
//  32		1	5	133
//  33		2	0	145
//  34		3	0	148
//  35		4	0	152
//  36		1	0	157
//  37		2	0	159
//  38		3	0	162
//  39		4	0	166
//  40		1	6	171
//  41		2	0	185
//  42		3	0	188
//  43		4	0	192
//  44		1	0	197
//  45		2	0	199
//  46		3	0	202
//  47		4	0	206
//  48		1	7	211
//  49		2	0	227
//  50		3	0	230
//  51		4	0	234
//  52		1	0	239
//  53		2	0	241
//  54		3	0	244
//  55		4	0	248
//  56		1	8	253
//  57		2	0	271
//  58		3	0	274
//  59		4	0	278
//  60		1	0	283
//  61		2	0	285
//  62		3	0	288
//  63		4	0	292
//# sourceMappingURL=readonlyRegisters.js.map