// IMPORTS
// ================================================================================================
import { createStark, createPrimeField } from '../../index';
import { StarkOptions } from '@guildofweavers/genstark';
import { getMdsMatrix, transpose, getRoundConstants, createHash } from './utils';
import { inline } from '../../lib/utils';

// STARK PARAMETERS
// ================================================================================================
const modulus = 2n**128n - 9n * 2n**32n + 1n;
const field = createPrimeField(modulus);
const stateWidth = 6;
const fRounds = 8;
const pRounds = 55;
const steps = fRounds + pRounds + 1;

const mds = getMdsMatrix(field, stateWidth);
const roundConstants = transpose(getRoundConstants(field, stateWidth, steps));

const poseidonHash = createHash(field, 5n, fRounds, pRounds, stateWidth);
const result = poseidonHash([1n, 2n, 3n, 4n]);

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
const securityOptions: Partial<StarkOptions> = {
    hashAlgorithm   : 'blake2s256',
    extensionFactor : 16,
    exeQueryCount   : 68,
    friQueryCount   : 24
};

const poseidonStark = createStark(Buffer.from(`
define Poseidon6x128 over prime field (${modulus}) {

    MDS: ${inline.matrix(mds)};

    transition 6 registers {
        for each ($i0, $i1, $i2, $i3) {
            
            // initialize the execution trace
            init [$i0, $i1, $i2, $i3, 0, 0];

            for steps [1..4, 60..63] {
                // full rounds
                MDS # ($r + $k)^5;
            }

            for steps [5..59] {
                // partial rounds
                v5 <- ($r5 + $k5)^5;
                MDS # [...($r[0..4] + $k[0..4]), v5];
            }
        }
    }

    enforce 6 constraints {
        for all steps {
            transition($r) = $n;
        }
    }

    using 6 readonly registers {
        $k0: repeat ${inline.vector(roundConstants[0])};
        $k1: repeat ${inline.vector(roundConstants[1])};
        $k2: repeat ${inline.vector(roundConstants[2])};
        $k3: repeat ${inline.vector(roundConstants[3])};
        $k4: repeat ${inline.vector(roundConstants[4])};
        $k5: repeat ${inline.vector(roundConstants[5])};
    }
}`), securityOptions, true);

// TESTING
// ================================================================================================
// set up inputs and assertions
const inputs = [[1n, 2n, 3n, 4n]];
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
console.log(`Security level: ${poseidonStark.securityLevel}`)