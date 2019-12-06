// IMPORTS
// ================================================================================================
import { Stark, createPrimeField } from '../../index';
import { SecurityOptions } from '@guildofweavers/genstark';
import { getMdsMatrix, transpose, getRoundConstants, createHash } from './utils';
import { inline } from '../../lib/utils';

// STARK PARAMETERS
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
const securityOptions: Partial<SecurityOptions> = {
    hashAlgorithm   : 'blake2s256',
    extensionFactor : 16,
    exeQueryCount   : 68,
    friQueryCount   : 24
};

const poseidonStark = new Stark(`
define Poseidon3x128 over prime field (${modulus}) {

    MDS: ${inline.matrix(mds)};

    transition 3 registers {
        for each ($i0, $i1) {
            
            // initialize the execution trace
            init [$i0, $i1, 0];

            for steps [1..4, 60..63] {
                // full rounds
                MDS # ($r + $k)^5;
            }

            for steps [5..59] {
                // partial rounds
                v2 <- ($r2 + $k2)^5;
                MDS # [...($r[0..1] + $k[0..1]), v2];
            }
        }
    }

    enforce 3 constraints {
        for all steps {
            transition($r) = $n;
        }
    }

    using 3 readonly registers {
        $k0: repeat ${inline.vector(roundConstants[0])};
        $k1: repeat ${inline.vector(roundConstants[1])};
        $k2: repeat ${inline.vector(roundConstants[2])};
    }
}`, securityOptions, true);

// TESTING
// ================================================================================================
// set up inputs and assertions
const inputs = [[42n, 43n]];
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