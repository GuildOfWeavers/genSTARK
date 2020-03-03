// IMPORTS
// ================================================================================================
import { instantiateScript, createPrimeField } from '../../index';
import { StarkOptions } from '@guildofweavers/genstark';
import { getMdsMatrix, transpose, getRoundConstants, createHash } from './utils';
import { Logger, inline } from '../../lib/utils';

// POSEIDON PARAMETERS
// ================================================================================================
const modulus = 2n**128n - 9n * 2n**32n + 1n;
const field = createPrimeField(modulus);
const stateWidth = 3;
const fRounds = 8;
const pRounds = 55;
const steps = fRounds + pRounds + 1;

const mds = getMdsMatrix(field, stateWidth);
const roundConstants = transpose(getRoundConstants(field, stateWidth, steps));

const poseidonHash = createHash(field, 5n, fRounds, pRounds, stateWidth);
const result = poseidonHash([42n, 43n]);

const roundControls: bigint[] = [];
for (let i = 0; i < fRounds + pRounds; i++) {
    if ((i < fRounds / 2) || (i >= fRounds / 2 + pRounds)) {
        roundControls.push(1n);
    } else {
        roundControls.push(0n);
    }
}
roundControls.push(0n);

// STARK DEFINITION
// ================================================================================================
const options: StarkOptions = {
    hashAlgorithm   : 'blake2s256',
    extensionFactor : 16,
    exeQueryCount   : 68,
    friQueryCount   : 24,
    wasm            : true
};

const poseidonStark = instantiateScript(Buffer.from(`
define Poseidon3x128 over prime field (${modulus}) {

    const mds: ${inline.matrix(mds)};

    static roundConstants: [
        cycle ${inline.vector(roundConstants[0])},
        cycle ${inline.vector(roundConstants[1])},
        cycle ${inline.vector(roundConstants[2])}
    ];

    secret input value1: element[1];
    secret input value2: element[1];

    transition 3 registers {
        for each (value1, value2) {
            
            // initialize the execution trace
            init { yield [value1, value2, 0]; }

            for steps [1..4, 60..63] {
                // full rounds
                yield mds # ($r + roundConstants)^5;
            }

            for steps [5..59] {
                // partial rounds
                v2 <- ($r2 + roundConstants[2])^5;
                yield mds # [...($r[0..1] + roundConstants[0..1]), v2];
            }
        }
    }

    enforce 3 constraints {
        for all steps {
            enforce transition($r) = $n;
        }
    }
}`), options, new Logger(false));

// TESTING
// ================================================================================================
// set up inputs and assertions
const inputs = [[42n], [43n]];
const assertions = [
    { step: steps-1, register: 0, value: result[0] },
    { step: steps-1, register: 1, value: result[1] },
];

// generate a proof
const proof = poseidonStark.prove(assertions, inputs);
console.log('-'.repeat(20));

// verify the proof
poseidonStark.verify(assertions, proof);
console.log('-'.repeat(20));
console.log(`Proof size: ${Math.round(poseidonStark.sizeOf(proof) / 1024 * 100) / 100} KB`);
console.log(`Security level: ${poseidonStark.securityLevel}`);