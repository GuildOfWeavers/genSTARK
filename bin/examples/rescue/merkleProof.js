"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const index_1 = require("../../index");
const utils_1 = require("./utils");
const utils_2 = require("../../lib/utils");
// RESCUE PARAMETERS
// ================================================================================================
const modulus = 2n ** 128n - 9n * 2n ** 32n + 1n;
const field = index_1.createPrimeField(modulus);
const treeDepth = 8;
const roundSteps = 32;
const alpha = 3n;
const invAlpha = -113427455640312821154458202464371168597n;
// MDS matrix and its inverse
const mds = [
    [340282366920938463463374607393113505064n, 340282366920938463463374607393113476633n, 340282366920938463463374607393112623703n, 340282366920938463463374607393088807273n],
    [1080n, 42471n, 1277640n, 35708310n],
    [340282366920938463463374607393113505403n, 340282366920938463463374607393113491273n, 340282366920938463463374607393113076364n, 340282366920938463463374607393101570233n],
    [40n, 1210n, 33880n, 925771n]
];
// Key constant parameters
const constants = [
    144517900019036866096022507193071809599n, 271707809579969091656092579345468860225n, 139424957805302989189422527487860690608n, 126750251129487986697737866024960215983n,
    271118613762407276564214152179206069413n, 39384648060424157691646880565718875760n, 189037434251220539428539337560615209464n, 218986062987136192416421725751708413726n,
    103808983578136303126641899945581033860n, 198823153506012419365570940451368319246n, 339599443104046223725845265111864465825n, 169004341575174204803282453992954960786n,
    171596418631454858790177474513731208863n, 157569361262795131998922854453557743690n, 211837534394685913032370295607135890739n, 328609939009439440841980058678511564944n,
    229628671790616575443886906286361261591n, 95675137928612392156876334331168593412n, 301613873771889848137714364785485714735n, 278224571298089265666737094541710980794n,
    140049647417493050970983064725330334359n, 159594320057012289760186736637936788141n, 44954493393746175043012738454844468290n, 223519669575552375517628855932195463175n
];
// create rescue instance, and use it to calculate key constants for every round of computation
const rescue = new utils_1.Rescue(field, alpha, invAlpha, 4, roundSteps, mds, constants);
const keyStates = rescue.unrollConstants();
const { roundConstants } = rescue.groupConstants(keyStates);
// STARK DEFINITION
// ================================================================================================
// define security options for the STARK
const options = {
    hashAlgorithm: 'blake2s256',
    extensionFactor: 16,
    exeQueryCount: 60,
    friQueryCount: 24,
    wasm: true
};
const merkleStark = index_1.instantiateScript(Buffer.from(`
define RescueMP over prime field (${modulus}) {

    const alpha: 3;
    const inv_alpha: 113427455640312821154458202464371168597;

    const mds: [
        [340282366920938463463374607393113505064, 340282366920938463463374607393113476633, 340282366920938463463374607393112623703, 340282366920938463463374607393088807273],
        [                                   1080,                                   42471,                                 1277640,                                35708310],
        [340282366920938463463374607393113505403, 340282366920938463463374607393113491273, 340282366920938463463374607393113076364, 340282366920938463463374607393101570233],
        [                                     40,                                    1210,                                   33880,                                  925771]
    ];

    const inv_mds: [
        [236997924285633886309140921207528337986, 247254910923297358352547052529406562002, 311342028444809266296393502237594936029, 126030506267014245727175780515967965110],
        [ 33069997328254894416993606273702832836,  59740111947936946229464514160137230831,  88480676416265968399408181712033476738, 124630167308491865219096049621346098829],
        [336618017400133662891528246258390023400, 144341202744775798260123226512082052891, 154884404066691444097361840554534567820,   4667796528407935026932436315406220930],
        [ 73878794827854483309086441046605817365, 229228508225866824084614421584601165863, 125857624914110248133585690282064031000,  84953896817024417490170340940393220925]
    ];

    // define round constants for Rescue hash function
    static roundConstants: [
        cycle ${utils_2.inline.vector(roundConstants[0])},
        cycle ${utils_2.inline.vector(roundConstants[1])},
        cycle ${utils_2.inline.vector(roundConstants[2])},
        cycle ${utils_2.inline.vector(roundConstants[3])},
        cycle ${utils_2.inline.vector(roundConstants[4])},
        cycle ${utils_2.inline.vector(roundConstants[5])},
        cycle ${utils_2.inline.vector(roundConstants[6])},
        cycle ${utils_2.inline.vector(roundConstants[7])}
    ];

    // declare inputs
    secret input leaf       : element[1];       // leaf of the merkle branch
    secret input node       : element[1][1];    // nodes in the merkle branch
    public input indexBit   : boolean[1][1];    // binary representation of leaf position

    transition 8 registers {
        for each (leaf, node, indexBit) {

            // initialize state with first 2 node values
            init {
                yield [leaf, node, 0, 0, node, leaf, 0, 0];
            }

            for each (node, indexBit) {

                // for each node, figure out which value advances to the next cycle
                init {
                    h <- indexBit ? $r4 : $r0;
                    yield [h, node, 0, 0, node, h, 0, 0];
                }

                // execute Rescue hash function computation for 31 steps
                for steps [1..31] {
                    // compute hash(p, v)
                    S1 <- mds # $r[0..3]^alpha + roundConstants[0..3];
                    S1 <- mds # (/S1)^(inv_alpha) + roundConstants[4..7];
    
                    // compute hash(v, p)
                    S2 <- mds # $r[4..7]^alpha + roundConstants[0..3];
                    S2 <- mds # (/S2)^(inv_alpha) + roundConstants[4..7];
    
                    yield [...S1, ...S2];
                }
            }
        }
    }

    enforce 8 constraints {
        for each (leaf, node, indexBit) {
            init {
                enforce [leaf, node, 0, 0, node, leaf, 0, 0] = $n;
            }

            for each (node, indexBit) {
                init {
                    h <- indexBit ? $r4 : $r0;
                    enforce [h, node, 0, 0, node, h, 0, 0] = $n;
                }

                for steps [1..31] {
                    // compute hash(p, v)
                    S1 <- mds # $r[0..3]^alpha + roundConstants[0..3];
                    N1 <- (inv_mds # ($n[0..3] - roundConstants[4..7]))^alpha;
    
                    // compute hash(v, p)
                    S2 <- mds # $r[4..7]^alpha + roundConstants[0..3];
                    N2 <- (inv_mds # ($n[4..7] - roundConstants[4..7]))^alpha;
    
                    enforce [...S1, ...S2] = [...N1, ...N2];
                }
            }
        }
    }
}`), options, new utils_2.Logger(false));
// TESTING
// ================================================================================================
// generate a random merkle tree
const values = field.prng(42n, 2 ** treeDepth);
const hash = utils_1.makeHashFunction(rescue, keyStates);
const tree = new utils_1.MerkleTree(values.toValues(), hash);
// generate a proof for index 42
const index = 42;
const proof = tree.prove(index);
//console.log(MerkleTree.verify(tree.root, index, proof, hash));
// set up inputs and assertions for the STARK
const leaf = proof.shift();
const indexBits = toBinaryArray(index, treeDepth);
indexBits.unshift(0n);
indexBits.pop();
const inputs = [[leaf], [proof], [indexBits]];
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
//# sourceMappingURL=merkleProof.js.map