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
// STARK DEFINITION
// ================================================================================================
// define security options for the STARK
const options = {
    hashAlgorithm: 'blake2s256',
    extensionFactor: 32,
    exeQueryCount: 44,
    friQueryCount: 20,
    wasm: true
};
const merkleStark = index_1.instantiate(Buffer.from(`
define PoseidonMP over prime field (${modulus}) {

    MDS: ${utils_2.inline.matrix(mds)};
    alpha: ${sBoxExp};

    transition 12 registers {
        for each ($i0, $i1, $i2, $i3) {

            // initialize state with first 2 node values
            init {
                S1 <- [$i0, $i1, $i2, $i3, 0, 0];
                S2 <- [$i2, $i3, $i0, $i1, 0, 0];
                [...S1, ...S2];
            }

            for each ($i2, $i3) {

                // for each node, figure out which value advances to the next cycle
                init {
                    H <- $p0 ? $r[6..7] : $r[0..1];
                    S1 <- [...H, $i2, $i3, 0, 0];
                    S2 <- [$i2, $i3, ...H, 0, 0];
                    [...S1, ...S2];
                }

                // execute Poseidon hash function computation for 63 steps
                for steps [1..4, 60..63] {
                    // full rounds
                    S1 <- MDS # ($r[0..5] + $k)^alpha;
                    S2 <- MDS # ($r[6..11] + $k)^alpha;
                    [...S1, ...S2];
                }
    
                for steps [5..59] {
                    // partial round
                    S1 <- MDS # [...($r[0..4] + $k[0..4]), ($r5 + $k5)^alpha];	
                    S2 <- MDS # [...($r[6..10] + $k[0..4]), ($r11 + $k5)^alpha];
                    [...S1, ...S2];
                }
            }
        }
    }

    enforce 12 constraints {
        for all steps {
            transition($r) = $n;
        }
    }

    using 7 readonly registers {
        $p0: spread binary [...];   // binary representation of node index

        // round constants
        $k0: repeat ${utils_2.inline.vector(roundConstants[0])};
        $k1: repeat ${utils_2.inline.vector(roundConstants[1])};
        $k2: repeat ${utils_2.inline.vector(roundConstants[2])};
        $k3: repeat ${utils_2.inline.vector(roundConstants[3])};
        $k4: repeat ${utils_2.inline.vector(roundConstants[4])};
        $k5: repeat ${utils_2.inline.vector(roundConstants[5])};
    }
}`), options);
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
// put first element of the proof into registers $i0 and $i1, and all other nodes into $i2 and $i3
const leaf = proof.shift();
const nodes = utils_1.transpose(proof);
const inputs = [[leaf[0], leaf[1], nodes[0], nodes[1]]];
const assertions = [
    { step: roundSteps * treeDepth - 1, register: 0, value: tree.root[0] },
    { step: roundSteps * treeDepth - 1, register: 1, value: tree.root[1] }
];
// generate a proof
const sProof = merkleStark.prove(assertions, inputs); // TODO
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