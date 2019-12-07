// IMPORTS
// ================================================================================================
import { createStark } from '../../index';

// STARK DEFINITION
// ================================================================================================
const steps = 2**6, result = 780n;

const demoStark = createStark(Buffer.from(`
define Demo over prime field (96769) {

    transition 1 register {
        for each ($i0) {
            init { $i0 }
            for steps [1..${steps - 1}] {
                $r0 + 1 + $k0 + 2 * $k1;
            }
        }
    }

    enforce 1 constraint {
        for all steps {
            transition($r) = $n;
        }
    }

    using 2 readonly registers {
        $k0: repeat [1, 2, 3, 4];
        $k1: spread [1, 2, 3, 4, 5, 6, 7, 8];
    }
}`));

// TESTING
// ================================================================================================
// set up inputs and assertions
const inputs = [[1n]];
const assertions = [
    { step: 0, register: 0, value: inputs[0][0] },
    { step: steps-1, register: 0, value: result  }
];

// generate a proof
const proof = demoStark.prove(assertions, inputs);
console.log('-'.repeat(20));

// verify the proof
demoStark.verify(assertions, proof);
console.log('-'.repeat(20));

// EXECUTION TRACE
// ================================================================================================
// K0 is the first (repeating) static register, K1 is the second (stretched) static, 
// V0 is the mutable register. The transition function is vNext = v0 + 1 + K0 + 2 * K1
//
//  Step	K0	K1	V0
//  0       1   1   1
//  1       2   1   5
//  2       3   1   10
//  3       4   1   16
//  4       1   1   23
//  5       2   1   27
//  6       3   1   32
//  7       4   1   38
//  8       1   2   45
//  9       2   2   51
//  10      3   2   58
//  11      4   2   66
//  12      1   2   75
//  13      2   2   81
//  14      3   2   88
//  15      4   2   96
//  16      1   3   105
//  17      2   3   113
//  18      3   3   122
//  19      4   3   132
//  20      1   3   143
//  21      2   3   151
//  22      3   3   160
//  23      4   3   170
//  24      1   4   181
//  25      2   4   191
//  26      3   4   202
//  27      4   4   214
//  28      1   4   227
//  29      2   4   237
//  30      3   4   248
//  31      4   4   260
//  32      1   5   273
//  33      2   5   285
//  34      3   5   298
//  35      4   5   312
//  36      1   5   327
//  37      2   5   339
//  38      3   5   352
//  39      4   5   366
//  40      1   6   381
//  41      2   6   395
//  42      3   6   410
//  43      4   6   426
//  44      1   6   443
//  45      2   6   457
//  46      3   6   472
//  47      4   6   488
//  48      1   7   505
//  49      2   7   521
//  50      3   7   538
//  51      4   7   556
//  52      1   7   575
//  53      2   7   591
//  54      3   7   608
//  55      4   7   626
//  56      1   8   645
//  57      2   8   663
//  58      3   8   682
//  59      4   8   702
//  60      1   8   723
//  61      2   8   741
//  62      3   8   760
//  63      4   8   780