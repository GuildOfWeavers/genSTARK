"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const index_1 = require("../../index");
const utils_1 = require("./utils");
const utils_2 = require("../../lib/utils");
// POSEIDON PARAMETERS
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
const merkleStark = index_1.instantiateScript(Buffer.from(`
define PoseidonMP over prime field (${modulus}) {

    const mds: ${utils_2.inline.matrix(mds)};
    const alpha: ${sBoxExp};

    // define round constants for Poseidon hash function
    static roundConstants: [
        cycle ${utils_2.inline.vector(roundConstants[0])},
        cycle ${utils_2.inline.vector(roundConstants[1])},
        cycle ${utils_2.inline.vector(roundConstants[2])},
        cycle ${utils_2.inline.vector(roundConstants[3])},
        cycle ${utils_2.inline.vector(roundConstants[4])},
        cycle ${utils_2.inline.vector(roundConstants[5])}
    ];

    // declare inputs
    secret input leaf       : element[2];       // leaf of the merkle branch
    secret input node       : element[2][1];    // nodes in the merkle branch
    public input indexBit   : boolean[1][1];    // binary representation of leaf position

    // define transition function
    transition 12 registers {
        for each (leaf, node, indexBit) {

            // initialize state with first 2 node values
            init {
                S1 <- [...leaf, ...node, 0, 0];
                S2 <- [...node, ...leaf, 0, 0];
                yield [...S1, ...S2];
            }

            for each (node, indexBit) {

                // for each node, figure out which value advances to the next cycle
                init {
                    H <- indexBit ? $r[6..7] : $r[0..1];
                    S1 <- [...H, ...node, 0, 0];
                    S2 <- [...node, ...H, 0, 0];
                    yield [...S1, ...S2];
                }

                // execute Poseidon hash function computation for 63 steps
                for steps [1..4, 60..63] {
                    // full round
                    S1 <- mds # ($r[0..5] + roundConstants)^alpha;
                    S2 <- mds # ($r[6..11] + roundConstants)^alpha;
                    yield  [...S1, ...S2];
                }
    
                for steps [5..59] {
                    // partial round
                    v1 <- ($r5 + roundConstants[5])^5;
                    S1 <- mds # [...($r[0..4] + roundConstants[0..4]), v1];
                    v2 <- ($r11 + roundConstants[5])^5;
                    S2 <- mds # [...($r[6..10] + roundConstants[0..4]), v2];
                    yield [...S1, ...S2];
                }
            }
        }
    }

    // define transition constraints
    enforce 12 constraints {
        for all steps {
            enforce transition($r) = $n;
        }
    }
}`), options, new utils_2.Logger(false));
// TESTING
// ================================================================================================
// generate a random merkle tree
const hash = utils_1.createHash(field, sBoxExp, fRounds, pRounds, stateWidth);
const tree = new utils_1.MerkleTree(buildLeaves(2 ** treeDepth), hash);
// generate a proof for index 42
const index = 42;
const proof = tree.prove(index);
//console.log(MerkleTree.verify(tree.root, index, proof, hash));
// set up inputs for the STARK
// first, convert index to binary form and shift it by one to align it with the end of the first loop
let indexBits = toBinaryArray(index, treeDepth);
indexBits.unshift(0n);
indexBits.pop();
// put the leaf into registers 0 and 1, nodes into registers 2 and 3, and indexBits into register 4
const leaf = proof.shift();
const nodes = utils_1.transpose(proof);
const inputs = [[leaf[0]], [leaf[1]], [nodes[0]], [nodes[1]], [indexBits]];
// set up assertions for the STARK
const assertions = [
    { step: roundSteps * treeDepth - 1, register: 0, value: tree.root[0] },
    { step: roundSteps * treeDepth - 1, register: 1, value: tree.root[1] }
];
// generate a proof
const sProof = merkleStark.prove(assertions, inputs);
console.log('-'.repeat(20));
// verify the proof
merkleStark.verify(assertions, sProof, [[indexBits]]);
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