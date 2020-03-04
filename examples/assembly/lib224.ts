// IMPORTS
// ================================================================================================
import { StarkOptions, Assertion } from '@guildofweavers/genstark';
import { createPrimeField, instantiate } from '../../index';
import { prng } from '@guildofweavers/air-assembly';
import { transpose, createHash2 as createHash, MerkleTree2 as MerkleTree } from '../poseidon/utils';
import { Logger } from '../../lib/utils';

// MODULE VARIABLES
// ================================================================================================
const modulus =  2n**224n - 2n**96n + 1n;
const field = createPrimeField(modulus);

// Poseidon constants
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

// STARK DEFINITIONS
// ================================================================================================
const options: StarkOptions = {
    hashAlgorithm   : 'blake2s256',
    extensionFactor : 32,
    exeQueryCount   : 44,
    friQueryCount   : 20,
    wasm            : false
};

const hashStark = instantiate('./assembly/lib224.aa', 'ComputePoseidonHash', options, new Logger(false));
const merkleStark = instantiate('./assembly/lib224.aa', 'ComputeMerkleRoot', options, new Logger(false));
const transStark = instantiate('./assembly/lib224.aa', 'ComputeMerkleUpdate', options, new Logger(false));

testMerkleUpdate();

// TEST FUNCTIONS
// ================================================================================================
function testHash() {

    const steps = fRounds + pRounds + 1;

    // create control values
    const hash = createHash(field, sBoxExp, fRounds, pRounds, stateWidth, roundConstants);
    const controls = hash([42n, 43n]);

    // set up inputs and assertions
    const inputs = [[42n], [43n]];
    const assertions: Assertion[] = [
        { step: steps-1, register: 0, value: controls[0] },
        { step: steps-1, register: 1, value: controls[1] },
    ];

    // generate a proof
    const proof = hashStark.prove(assertions, inputs);
    console.log('-'.repeat(20));

    // verify the proof
    hashStark.verify(assertions, proof);
    console.log('-'.repeat(20));
    console.log(`Proof size: ${Math.round(hashStark.sizeOf(proof) / 1024 * 100) / 100} KB`);
    console.log(`Security level: ${hashStark.securityLevel}`);
}

function testMerkleProof() {
    
    const treeDepth = 8;
    const roundSteps = fRounds + pRounds + 1;

    // generate a random merkle tree
    const hash = createHash(field, sBoxExp, fRounds, pRounds, stateWidth, roundConstants);
    const leaves = buildLeaves(2**treeDepth);
    const tree = new MerkleTree(leaves, hash);

    // generate a proof for index 42
    const index = 42;
    const proof = tree.prove(index);
    //console.log(MerkleTree.verify(tree.root, index, proof, hash));

    // first, convert index to binary form and shift it by one to align it with the end of the first loop
    let indexBits = toBinaryArray(index, treeDepth);
    indexBits.unshift(0n);
    indexBits.pop();

    // put the leaf into register 0, nodes into register 1, and indexBits into register 2
    const leaf = proof.shift()!;
    const inputs = [ [leaf], [proof], [indexBits]];

    // set up assertions for the STARK
    const assertions: Assertion[] = [
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
}

function testMerkleUpdate() {
    
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
    const sProof = transStark.prove(assertions, inputs);
    console.log('-'.repeat(20));

    // verify the proof
    transStark.verify(assertions, sProof);
    console.log('-'.repeat(20));
    console.log(`Proof size: ${Math.round(transStark.sizeOf(sProof) / 1024 * 100) / 100} KB`);
    console.log(`Security level: ${transStark.securityLevel}`);
}

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