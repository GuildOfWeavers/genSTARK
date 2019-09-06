"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../../index");
const utils_1 = require("./utils");
const utils_2 = require("../../lib/utils");
// STARK PARAMETERS
// ================================================================================================
const modulus = 2n ** 128n - 9n * 2n ** 32n + 1n;
const field = index_1.createPrimeField(modulus);
const sBoxExp = 5n;
const stateWidth = 6;
const fRounds = 8;
const pRounds = 55;
const roundSteps = fRounds + pRounds + 1;
const treeDepth = 8;
// MDS matrix and its inverse
const mds = utils_1.getMdsMatrix(field, stateWidth);
const roundConstants = utils_1.transpose(utils_1.getRoundConstants(field, stateWidth, roundSteps));
const roundControls = utils_1.getRoundControls(fRounds, pRounds, roundSteps);
// STARK DEFINITION
// ================================================================================================
// define security options for the STARK
const securityOptions = {
    hashAlgorithm: 'blake2s256',
    extensionFactor: 32,
    exeQueryCount: 44,
    friQueryCount: 20
};
const merkleStark = new index_1.Stark(`
define Poseidon6x128 over prime field (${modulus}) {

    MDS: ${utils_2.inline.matrix(mds)};
    alpha: ${sBoxExp};

    transition 12 registers in ${roundSteps * treeDepth} steps {
        when ($k7) {
            when ($k6) {
                // full rounds

                K: [$k0, $k1, $k2, $k3, $k4, $k5];
                    
                // compute hash(p, v)
                S1: [$r0, $r1, $r2, $r3, $r4, $r5];
                S1: MDS # (S1 + K)^alpha;

                // compute hash(v, p)
                S2: [$r6, $r7, $r8, $r9, $r10, $r11];
                S2: MDS # (S2 + K)^alpha;

                out: [...S1, ...S2];
            }
            else {
                // partial rounds

                // compute hash(p, v)
                va: ($r5 + $k5)^alpha;
                S1: [$r0 + $k0, $r1 + $k1, $r2 + $k2, $r3 + $k3, $r4 + $k4, va];
                S1: MDS # S1;
    
                // compute hash(v, p)
                vb: ($r11 + $k5)^alpha;
                S2: [$r6 + $k0, $r7 + $k1, $r8 + $k2, $r9 + $k3, $r10 + $k4, vb];
                S2: MDS # S2;

                out: [...S1, ...S2];
            }
        }
        else {
            // this happens every 64th step

            h1: $p0 ? $r6 | $r0;
            h2: $p0 ? $r7 | $r1;

            S1: [h1, h2, $s0, $s1, 0, 0];
            S2: [$s0, $s1, h1, h2, 0, 0];

            out: [...S1, ...S2];
        }
    }

    enforce 12 constraints {
        when ($k7) {
            when ($k6) {
                // full rounds

                K: [$k0, $k1, $k2, $k3, $k4, $k5];
                    
                // compute hash(p, v)
                S1: [$r0, $r1, $r2, $r3, $r4, $r5];
                S1: MDS # (S1 + K)^alpha;

                // compute hash(v, p)
                S2: [$r6, $r7, $r8, $r9, $r10, $r11];
                S2: MDS # (S2 + K)^alpha;

                N: [$n0, $n1, $n2, $n3, $n4, $n5, $n6, $n7, $n8, $n9, $n10, $n11];
                S: [...S1, ...S2];
                out: N - S;
            }
            else {
                // partial rounds

                // compute hash(p, v)
                va: ($r5 + $k5)^alpha;
                S1: [$r0 + $k0, $r1 + $k1, $r2 + $k2, $r3 + $k3, $r4 + $k4, va];
                S1: MDS # S1;
    
                // compute hash(v, p)
                vb: ($r11 + $k5)^alpha;
                S2: [$r6 + $k0, $r7 + $k1, $r8 + $k2, $r9 + $k3, $r10 + $k4, vb];
                S2: MDS # S2;

                N: [$n0, $n1, $n2, $n3, $n4, $n5, $n6, $n7, $n8, $n9, $n10, $n11];
                S: [...S1, ...S2];
                out: N - S;
            }
        }
        else {
            // this happens every 64th step

            h1: $p0 ? $r6 | $r0;
            h2: $p0 ? $r7 | $r1;

            S1: [h1, h2, $s0, $s1, 0, 0];
            S2: [$s0, $s1, h1, h2, 0, 0];

            N: [$n0, $n1, $n2, $n3, $n4, $n5, $n6, $n7, $n8, $n9, $n10, $n11];
            S: [...S1, ...S2];
            out: N - S;
        }
    }

    using 11 readonly registers {
        $p0: spread binary [...];   // binary representation of node index


        // merkle branch nodes
        $s0: spread [...];
        $s1: spread [...];

        // round constants
        $k0: repeat ${utils_2.inline.vector(roundConstants[0])};
        $k1: repeat ${utils_2.inline.vector(roundConstants[1])};
        $k2: repeat ${utils_2.inline.vector(roundConstants[2])};
        $k3: repeat ${utils_2.inline.vector(roundConstants[3])};
        $k4: repeat ${utils_2.inline.vector(roundConstants[4])};
        $k5: repeat ${utils_2.inline.vector(roundConstants[5])};

        // round controls
        $k6: repeat binary ${utils_2.inline.vector(roundControls)};

        // 63 ones followed by a zero - will be used to control conditional expression
        $k7: repeat binary [
            1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
            1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
        ];
    }
}`, securityOptions, true);
// TESTING
// ================================================================================================
// generate a random merkle tree
const hash = utils_1.createHash(field, sBoxExp, fRounds, pRounds, stateWidth);
const tree = new utils_1.MerkleTree(buildLeaves(2 ** treeDepth), hash);
// generate a proof for index 42
const index = 1;
const proof = tree.prove(index);
//console.log(MerkleTree.verify(tree.root, index, proof, hash));
// set up inputs and assertions for the STARK
const binaryIndex = toBinaryArray(index, treeDepth);
// put first two elements of the proof into initValues
const leaf = proof.shift(), sibling = proof.shift();
const initValues = [leaf[0], leaf[1], sibling[0], sibling[1], 0n, 0n, sibling[0], sibling[1], leaf[0], leaf[1], 0n, 0n];
const assertions = [
    { step: roundSteps * treeDepth - 1, register: 0, value: tree.root[0] },
    { step: roundSteps * treeDepth - 1, register: 1, value: tree.root[1] }
];
// add a dummy value at the end of the proof so that length is a power of 2
proof.push([0n, 0n]);
const nodes = utils_1.transpose(proof);
// generate a proof
const sProof = merkleStark.prove(assertions, initValues, [binaryIndex], nodes);
console.log('-'.repeat(20));
// verify the proof
merkleStark.verify(assertions, sProof, [binaryIndex]);
console.log('-'.repeat(20));
console.log(`Proof size: ${Math.round(merkleStark.sizeOf(sProof) / 1024 * 100) / 100} KB`);
console.log(`Security level: ${merkleStark.securityLevel}`);
// HELPER FUNCTIONS
// ================================================================================================
function toBinaryArray(value, length) {
    const binText = value.toString(2);
    const result = new Array(length).fill(0n);
    for (let i = binText.length - 1, j = 0; i >= 0; i--, j++) {
        result[j] = BigInt(binText[i]);
    }
    return result;
}
function buildLeaves(count) {
    const values1 = field.prng(42n, count);
    const values2 = field.prng(43n, count);
    const result = new Array();
    for (let i = 0; i < count; i++) {
        result[i] = [values1.getValue(i), values2.getValue(i)];
    }
    return result;
}
//# sourceMappingURL=merkleProof.js.map