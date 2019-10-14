"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../../index");
const utils_1 = require("./utils");
// STARK PARAMETERS
// ================================================================================================
const field = index_1.createPrimeField(2n ** 128n - 9n * 2n ** 32n + 1n);
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
const securityOptions = {
    hashAlgorithm: 'blake2s256',
    extensionFactor: 16,
    exeQueryCount: 60,
    friQueryCount: 24
};
const merkleStark = new index_1.Stark(`
define MerkleProof over prime field (2^128 - 9 * 2^32 + 1) {

    alpha: 3;
    inv_alpha: 113427455640312821154458202464371168597;

    MDS: [
        [340282366920938463463374607393113505064, 340282366920938463463374607393113476633, 340282366920938463463374607393112623703, 340282366920938463463374607393088807273],
        [                                   1080,                                   42471,                                 1277640,                                35708310],
        [340282366920938463463374607393113505403, 340282366920938463463374607393113491273, 340282366920938463463374607393113076364, 340282366920938463463374607393101570233],
        [                                     40,                                    1210,                                   33880,                                  925771]
    ];

    INV_MDS: [
        [236997924285633886309140921207528337986, 247254910923297358352547052529406562002, 311342028444809266296393502237594936029, 126030506267014245727175780515967965110],
        [ 33069997328254894416993606273702832836,  59740111947936946229464514160137230831,  88480676416265968399408181712033476738, 124630167308491865219096049621346098829],
        [336618017400133662891528246258390023400, 144341202744775798260123226512082052891, 154884404066691444097361840554534567820,   4667796528407935026932436315406220930],
        [ 73878794827854483309086441046605817365, 229228508225866824084614421584601165863, 125857624914110248133585690282064031000,  84953896817024417490170340940393220925]
    ];

    transition 8 registers {
        for each ($i0, $i1) {
            init [$i0, $i1, 0, 0, $i1, $i0, 0, 0];

            for each ($i1) {
                init {
                    h <- $p0 ? $r4 : $r0;
                    [h, $i1, 0, 0, $i1, h, 0, 0];
                }

                for steps [1..31] {
                    // compute hash(p, v)
                    S1 <- MDS # $r[0..3]^alpha + $k[0..3];
                    S1 <- MDS # (/S1)^(inv_alpha) + $k[4..7];
    
                    // compute hash(v, p)
                    S2 <- MDS # $r[4..7]^alpha + $k[0..3];
                    S2 <- MDS # (/S2)^(inv_alpha) + $k[4..7];
    
                    [...S1, ...S2];
                }
            }
        }
    }

    enforce 8 constraints {
        for each ($i0, $i1) {
            init {
                [$i0, $i1, 0, 0, $i1, $i0, 0, 0] = $n;
            }

            for each ($i1) {
                init {
                    h <- $p0 ? $r4 : $r0;
                    [h, $i1, 0, 0, $i1, h, 0, 0] = $n;
                }

                for steps [1..31] {
                    // compute hash(p, v)
                    S1 <- MDS # $r[0..3]^alpha + $k[0..3];
                    N1 <- (INV_MDS # ($n[0..3] - $k[4..7]))^alpha;
    
                    // compute hash(v, p)
                    S2 <- MDS # $r[4..7]^alpha + $k[0..3];
                    N2 <- (INV_MDS # ($n[4..7] - $k[4..7]))^alpha;
    
                    [...(S1 - N1), ...(S2 - N2)];
                }
            }
        }
    }

    using 9 readonly registers {
        $p0: spread binary [...];   // binary representation of node index

        // constants for Rescue hash function
        $k0: repeat [${roundConstants[0].join(', ')}];
        $k1: repeat [${roundConstants[1].join(', ')}];
        $k2: repeat [${roundConstants[2].join(', ')}];
        $k3: repeat [${roundConstants[3].join(', ')}];
        $k4: repeat [${roundConstants[4].join(', ')}];
        $k5: repeat [${roundConstants[5].join(', ')}];
        $k6: repeat [${roundConstants[6].join(', ')}];
        $k7: repeat [${roundConstants[7].join(', ')}];
    }
}`, securityOptions, true);
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
const binaryIndex = toBinaryArray(index, treeDepth);
const initValues = [[leaf, proof]];
const assertions = [
    { step: roundSteps * treeDepth - 1, register: 0, value: tree.root }
];
// generate a proof
const sProof = merkleStark.prove(assertions, initValues, [binaryIndex]);
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
//# sourceMappingURL=merkleProof.js.map