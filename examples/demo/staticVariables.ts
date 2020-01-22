// IMPORTS
// ================================================================================================
import { instantiateScript } from '../../index';
import { Logger } from '../../lib/utils';

// STARK DEFINITION
// ================================================================================================
const steps = 2**6, result = 780n;

const demoStark = instantiateScript(Buffer.from(`
define Demo over prime field (96769) {

    static k0: cycle [1, 2, 3, 4];
    static k1: cycle [1, 2, 3, 4, 5, 6, 7, 8];

    secret input startValue: element[1];

    transition 1 register {
        for each (startValue) {
            init { yield startValue; }
            for steps [1..${steps - 1}] {
                yield $r0 + 1 + k0 + 2 * k1;
            }
        }
    }

    enforce 1 constraint {
        for all steps {
            enforce transition($r) = $n;
        }
    }
}`), undefined, new Logger(false));

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
// K0 is the first static variables, K1 is the second static, 
// V0 is the trace register. The transition function is vNext = v0 + 1 + K0 + 2 * K1
//
//  Step	K0	K1	V0
//  0       1   1   1 
//  1       2   2   5
//  2       3   3   12
//  3       4   4   22
//  4       1   5   35
//  5       2   6   47
//  6       3   7   62
//  7       4   8   80
//  8       1   1   101
//  9       2   2   105
//  10      3   3   112
//  11      4   4   122
//  12      1   5   135
//  13      2   6   147
//  14      3   7   162
//  15      4   8   180
//  16      1   1   201
//  17      2   2   205
//  18      3   3   212
//  19      4   4   222
//  20      1   5   235
//  21      2   6   247
//  22      3   7   262
//  23      4   8   280
//  24      1   1   301
//  25      2   2   305
//  26      3   3   312
//  27      4   4   322
//  28      1   5   335
//  29      2   6   347
//  30      3   7   362
//  31      4   8   380
//  32      1   1   401
//  33      2   2   405
//  34      3   3   412
//  35      4   4   422
//  36      1   5   435
//  37      2   6   447
//  38      3   7   462
//  39      4   8   480
//  40      1   1   501
//  41      2   2   505
//  42      3   3   512
//  43      4   4   522
//  44      1   5   535
//  45      2   6   547
//  46      3   7   562
//  47      4   8   580
//  48      1   1   601
//  49      2   2   605
//  50      3   3   612
//  51      4   4   622
//  52      1   5   635
//  53      2   6   647
//  54      3   7   662
//  55      4   8   680
//  56      1   1   701
//  57      2   2   705
//  58      3   3   712
//  59      4   4   722
//  60      1   5   735
//  61      2   6   747
//  62      3   7   762
//  63      4   8   780