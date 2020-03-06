"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const index_1 = require("../../index");
const utils_1 = require("../poseidon/utils");
const utils_2 = require("../../lib/utils");
const air_assembly_1 = require("@guildofweavers/air-assembly");
// POSEIDON PARAMETERS
// ================================================================================================
const modulus = 2n ** 224n - 2n ** 96n + 1n;
const field = index_1.createPrimeField(modulus);
const sBoxExp = 5n;
const stateWidth = 3;
const fRounds = 8;
const pRounds = 55;
const roundSteps = fRounds + pRounds + 1;
const treeDepth = 8;
// build round constants for the hash function
const roundConstants = utils_1.transpose([
    air_assembly_1.prng.sha256(Buffer.from('486164657331', 'hex'), 64, field),
    air_assembly_1.prng.sha256(Buffer.from('486164657332', 'hex'), 64, field),
    air_assembly_1.prng.sha256(Buffer.from('486164657333', 'hex'), 64, field)
]);
// STARK DEFINITION
// ================================================================================================
// define security options for the STARK
const options = {
    hashAlgorithm: 'blake2s256',
    extensionFactor: 32,
    exeQueryCount: 44,
    friQueryCount: 20,
    wasm: false
};
const merkleStark = index_1.instantiateScript(Buffer.from(`
import { ComputePoseidonHash as Hash } from '../assembly/lib224.aa';

define MerkleBranch over prime field (2^224 - 2^96 + 1) {

    secret input leaf       : element[1];      // leaf of the merkle branch
    secret input node       : element[1][1];   // nodes in the merkle authentication path
    public input indexBit   : boolean[1][1];   // binary representation of leaf position

    transition 6 registers {
        for each (leaf, node, indexBit) {

            // initialize the execution trace to hash(leaf, node) in registers [0..2]
            // and hash(node, leaf) in registers [3..5]
            init {
                s1 <- [leaf, node, 0];
                s2 <- [node, leaf, 0];
                yield [...s1, ...s2];
            }

            for each (node, indexBit) {

                // based on node's index, figure out whether hash(p, v) or hash(v, p)
                // should advance to the next iteration of the loop
                h <- indexBit ? $r3 : $r0;

                // compute hash(p, v) and hash(v, p) in parallel
                with $r[0..2] yield Hash(h, node);
                with $r[3..5] yield Hash(node, h);
            }
        }
    }

    enforce 6 constraints {
        for all steps {
            enforce transition($r) = $n;
        }
    }
}`), options, new utils_2.Logger(false));
// TESTING
// ================================================================================================
// generate a random merkle tree
const hash = utils_1.createHash(field, sBoxExp, fRounds, pRounds, stateWidth, roundConstants);
const tree = new utils_1.MerkleTree2(buildLeaves(2 ** treeDepth), hash);
// generate a proof for index 42
const index = 42;
const proof = tree.prove(index);
console.log(utils_1.MerkleTree2.verify(tree.root, index, proof, hash));
// set up inputs for the STARK
// first, convert index to binary form and shift it by one to align it with the end of the first loop
let indexBits = toBinaryArray(index, treeDepth);
indexBits.unshift(0n);
indexBits.pop();
// put the leaf into registers 0 and 1, nodes into registers 2 and 3, and indexBits into register 4
const leaf = proof.shift();
const inputs = [[leaf], [proof], [indexBits]];
// set up assertions for the STARK
const assertions = [
    { step: roundSteps * treeDepth - 1, register: 0, value: tree.root }
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
    const values = field.prng(42n, count);
    const result = new Array(count);
    for (let i = 0; i < count; i++) {
        result[i] = values.getValue(i);
    }
    return result;
}
//# sourceMappingURL=merkleProof.js.map