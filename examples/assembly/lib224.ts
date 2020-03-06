// IMPORTS
// ================================================================================================
import { StarkOptions, Assertion } from '@guildofweavers/genstark';
import { createPrimeField, instantiate } from '../../index';
import { prng } from '@guildofweavers/air-assembly';
import { transpose, createHash, MerkleTree2 as MerkleTree } from '../poseidon/utils';
import { Logger } from '../../lib/utils';

// MODULE VARIABLES
// ================================================================================================
const modulus = 2n**224n - 2n**96n + 1n;
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
const updateStark = instantiate('./assembly/lib224.aa', 'ComputeMerkleUpdate', options, new Logger(false));
const sigStark = instantiate('./assembly/lib224.aa', 'VerifySchnorrSignature', options, new Logger(false));

//testHash();
//testMerkleProof();
testMerkleUpdate();
//testSchnorrSignature();

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
    const sProof = updateStark.prove(assertions, inputs);
    console.log('-'.repeat(20));

    // verify the proof
    updateStark.verify(assertions, sProof);
    console.log('-'.repeat(20));
    console.log(`Proof size: ${Math.round(updateStark.sizeOf(sProof) / 1024 * 100) / 100} KB`);
    console.log(`Security level: ${updateStark.securityLevel}`);
}

function testSchnorrSignature() {

    const g = [19277929113566293071110308034699488026831934219452440156649784352033n, 19926808758034470970197974370888749184205991990603949537637343198772n];
    const p = [24313447595084304058594233432514534662288062665585856194673052057742n, 11283561012092599727291782123823281550391964133479792543258386661577n];
    const r = [24205906543396144211665254343088405371302546890229844964400088231402n, 14288195710129182954662708611241591530837581261860973703071318732478n];
    const s = 4985319172797574202062022188522117996928464993099991051165884930508n;
    const h = 22415580945459993343509530426358128444740520478775315096153588998695n;

    const inputs = [
        [g[0]], [g[1]],
        [toBits(s)],
        [p[0]], [p[1]],
        [toBits(h)],
        [r[0]], [r[1]]
    ];

    const assertions = [
        { step: 0,   register: 0,  value: g[0] },
        { step: 0,   register: 1,  value: g[1] },
        { step: 0,   register: 2,  value: 0n   },
        { step: 0,   register: 3,  value: 0n   },
        { step: 0,   register: 7,  value: p[0] },
        { step: 0,   register: 8,  value: p[1] },
        { step: 0,   register: 9,  value: r[0] },
        { step: 0,   register: 10, value: r[1] },
        { step: 255, register: 13, value: h    }
    ];

    // prove that the assertions hold if we execute signature verifications with given inputs
    let proof = sigStark.prove(assertions, inputs);
    console.log('-'.repeat(20));

    // serialize the proof
    let start = Date.now();
    const buf = sigStark.serialize(proof);
    console.log(`Proof serialized in ${Date.now() - start} ms; size: ${Math.round(buf.byteLength / 1024 * 100) / 100} KB`);
    console.log('-'.repeat(20));

    // deserialize the proof to make sure everything serialized correctly
    start = Date.now();
    proof = sigStark.parse(buf);
    console.log(`Proof parsed in ${Date.now() - start} ms`);
    console.log('-'.repeat(20));

    // verify the proof
    sigStark.verify(assertions, proof);
    console.log('-'.repeat(20));
    console.log(`STARK security level: ${sigStark.securityLevel}`);
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

function toBits(value: bigint) {
    const bits = value.toString(2).padStart(256, '0').split('');
    return bits.reverse().map(b => BigInt(b));
}