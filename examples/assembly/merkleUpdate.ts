// IMPORTS
// ================================================================================================
import { instantiateScript, createPrimeField } from '../../index';
import { StarkOptions, Assertion } from '@guildofweavers/genstark';
import { transpose, createHash, MerkleTree2 as MerkleTree } from '../poseidon/utils';
import { Logger } from '../../lib/utils';
import { prng } from '@guildofweavers/air-assembly';

// POSEIDON PARAMETERS
// ================================================================================================
const modulus = 2n**224n - 2n**96n + 1n;
const field = createPrimeField(modulus);
const sBoxExp = 5n;
const stateWidth = 3;
const fRounds = 8;
const pRounds = 55;

// build round constants for the hash function
const roundConstants = transpose([
    prng.sha256(Buffer.from('486164657331', 'hex'), 64, field),
    prng.sha256(Buffer.from('486164657332', 'hex'), 64, field),
    prng.sha256(Buffer.from('486164657333', 'hex'), 64, field)
]);

// STARK DEFINITION
// ================================================================================================
// define security options for the STARK
const options: StarkOptions = {
    hashAlgorithm   : 'blake2s256',
    extensionFactor : 32,
    exeQueryCount   : 44,
    friQueryCount   : 20,
    wasm            : false
};

const merkleStark = instantiateScript(Buffer.from(`
import { ComputeMerkleUpdate } from '../assembly/lib224.aa';

define MerkleBranch over prime field (2^224 - 2^96 + 1) {

    secret input oldLeaf    : element[1];       // old leaf of the merkle branch
    secret input newLeaf    : element[1];       // new leaf of the merkle branch
    secret input authPath   : element[1][1];    // merkle authentication path
    secret input indexBits  : boolean[1][1];    // binary representation of leaf position

    transition 12 registers {
        for each (oldLeaf, newLeaf, authPath, indexBits) {
            yield ComputeMerkleUpdate(oldLeaf, newLeaf, authPath, indexBits);
        }
    }

    enforce 13 constraints {
        for each (oldLeaf, newLeaf, authPath, indexBits) {
            enforce ComputeMerkleUpdate(oldLeaf, newLeaf, authPath, indexBits);
        }
    }
}`), options, new Logger(false));

// TESTING
// ================================================================================================
const hash = createHash(field, sBoxExp, fRounds, pRounds, stateWidth, roundConstants);
const treeDepth = 8;
const roundSteps = fRounds + pRounds + 1;

const index = 42, oldValue = 9n, newValue = 11n;

// build pre- and post-update Merkle trees
const leaves1 = buildLeaves(2**treeDepth);
leaves1[index] = oldValue;
const tree1 = new MerkleTree(leaves1, hash);
const proof1 = tree1.prove(index);

const leaves2 = leaves1.slice();
leaves2[index] = newValue;
const tree2 = new MerkleTree(leaves2, hash);
const proof2 = tree2.prove(index);

// convert index to binary form and shift it by one to align it with the end of the first loop
let indexBits = toBinaryArray(index, treeDepth);
indexBits.unshift(0n);
indexBits.pop();

// put old leaf into register 0, new leaf into register 1, nodes into registers 2, and indexBits into register 3
const oldLeaf = proof1.shift()!;
const newLeaf = proof2.shift()!
const inputs = [ [oldLeaf], [newLeaf], [proof1], [indexBits] ];

// set up assertions for the STARK
const assertions: Assertion[] = [
    { step: roundSteps * treeDepth - 1, register: 0, value: tree1.root },
    { step: roundSteps * treeDepth - 1, register: 6, value: tree2.root }
];

// generate a proof
const sProof = merkleStark.prove(assertions, inputs);
console.log('-'.repeat(20));

// verify the proof
merkleStark.verify(assertions, sProof);
console.log('-'.repeat(20));
console.log(`Proof size: ${Math.round(merkleStark.sizeOf(sProof) / 1024 * 100) / 100} KB`);
console.log(`Security level: ${merkleStark.securityLevel}`);

// HELPER FUNCTIONS
// ================================================================================================
function toBinaryArray(value: number, length: number) {
    const binText = value.toString(2);
    const result = new Array<bigint>(length).fill(0n);
    for (let i = binText.length - 1, j = 0; i >= 0; i--, j++) {
        result[j] = BigInt(binText[i]);
    }
    return result;
}

function buildLeaves(count: number): bigint[] {
    const values = field.prng(42n, count);
    const result = new Array(count);
    for (let i = 0; i < count; i++) {
        result[i] = values.getValue(i);
    }

    return result;
}