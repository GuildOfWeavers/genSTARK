"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const index_1 = require("../../index");
const utils_1 = require("./utils");
const utils_2 = require("../../lib/utils");
// STARK PARAMETERS
// ================================================================================================
const modulus = 2n ** 128n - 9n * 2n ** 32n + 1n;
const field = index_1.createPrimeField(modulus);
const stateWidth = 6;
const fRounds = 8;
const pRounds = 55;
const steps = fRounds + pRounds + 1;
const mds = utils_1.getMdsMatrix(field, stateWidth);
const roundConstants = utils_1.transpose(utils_1.getRoundConstants(field, stateWidth, steps));
const poseidonHash = utils_1.createHash(field, 5n, fRounds, pRounds, stateWidth);
const result = poseidonHash([1n, 2n, 3n, 4n]);
const roundControls = [];
for (let i = 0; i < fRounds + pRounds; i++) {
    if ((i < fRounds / 2) || (i >= fRounds / 2 + pRounds)) {
        roundControls.push(1n);
    }
    else {
        roundControls.push(0n);
    }
}
roundControls.push(0n);
// STARK DEFINITION
// ================================================================================================
const securityOptions = {
    hashAlgorithm: 'blake2s256',
    extensionFactor: 16,
    exeQueryCount: 68,
    friQueryCount: 24
};
const poseidonStark = new index_1.Stark(`
define Poseidon6x128 over prime field (${modulus}) {

    MDS: ${utils_2.inline.matrix(mds)};

    transition 6 registers in ${steps} steps {
        when ($k6) {
            S: [$r0, $r1, $r2, $r3, $r4, $r5];
            K: [$k0, $k1, $k2, $k3, $k4, $k5];

            out: MDS # (S + K)^5;
        }
        else {
            v5: ($r5 + $k5)^5;
            S: [$r0 + $k0, $r1 + $k1, $r2 + $k2, $r3 + $k3, $r4 + $k4, v5];

            out: MDS # S;
        }
    }

    enforce 6 constraints {
        when ($k6) {
            S: [$r0, $r1, $r2, $r3, $r4, $r5];
            K: [$k0, $k1, $k2, $k3, $k4, $k5];
            N: [$n0, $n1, $n2, $n3, $n4, $n5];
            
            out: N - MDS # (S + K)^5;
        }
        else {
            v5: ($r5 + $k5)^5;
            S: [$r0 + $k0, $r1 + $k1, $r2 + $k2, $r3 + $k3, $r4 + $k4, v5];
            N: [$n0, $n1, $n2, $n3, $n4, $n5];

            out: N - MDS # S;
        }
    }

    using 7 readonly registers {
        $k0: repeat ${utils_2.inline.vector(roundConstants[0])};
        $k1: repeat ${utils_2.inline.vector(roundConstants[1])};
        $k2: repeat ${utils_2.inline.vector(roundConstants[2])};
        $k3: repeat ${utils_2.inline.vector(roundConstants[3])};
        $k4: repeat ${utils_2.inline.vector(roundConstants[4])};
        $k5: repeat ${utils_2.inline.vector(roundConstants[5])};
        $k6: repeat binary ${utils_2.inline.vector(roundControls)};
    }
}`, securityOptions, true);
// TESTING
// ================================================================================================
// set up inputs and assertions
const initValues = [1n, 2n, 3n, 4n, 0n, 0n];
const assertions = [
    { step: steps - 1, register: 0, value: result[0] },
    { step: steps - 1, register: 1, value: result[1] },
];
// generate a proof
const proof = poseidonStark.prove(assertions, initValues);
console.log('-'.repeat(20));
// verify the proof
poseidonStark.verify(assertions, proof);
console.log('-'.repeat(20));
console.log(`Proof size: ${Math.round(poseidonStark.sizeOf(proof) / 1024 * 100) / 100} KB`);
console.log(`Security level: ${poseidonStark.securityLevel}`);
//# sourceMappingURL=hash6x128.js.map