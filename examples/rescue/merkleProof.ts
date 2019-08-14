// IMPORTS
// ================================================================================================
import { Assertion } from '@guildofweavers/genstark';
import { Stark, createPrimeField } from '../../index';
import { Rescue, MerkleTree, makeHashFunction } from './utils';

// STARK PARAMETERS
// ================================================================================================
const field = createPrimeField(2n**128n - 9n * 2n**32n + 1n);
const treeDepth = 8;
const roundSteps = 32;
const alpha = 3n;
const invAlpha = -113427455640312821154458202464371168597n;

// MDS matrix and its inverse
const mds = [
    [340282366920938463463374607393113505064n, 340282366920938463463374607393113476633n, 340282366920938463463374607393112623703n, 340282366920938463463374607393088807273n],
    [                                   1080n,                                   42471n,                                 1277640n,                                35708310n],
    [340282366920938463463374607393113505403n, 340282366920938463463374607393113491273n, 340282366920938463463374607393113076364n, 340282366920938463463374607393101570233n],
    [                                     40n,                                    1210n,                                   33880n,                                  925771n]
];

// Key constant parameters
const constants  = [
    144517900019036866096022507193071809599n,  271707809579969091656092579345468860225n, 139424957805302989189422527487860690608n, 126750251129487986697737866024960215983n,
    271118613762407276564214152179206069413n,   39384648060424157691646880565718875760n, 189037434251220539428539337560615209464n, 218986062987136192416421725751708413726n,
    103808983578136303126641899945581033860n,  198823153506012419365570940451368319246n, 339599443104046223725845265111864465825n, 169004341575174204803282453992954960786n,
    171596418631454858790177474513731208863n,  157569361262795131998922854453557743690n, 211837534394685913032370295607135890739n, 328609939009439440841980058678511564944n,
    229628671790616575443886906286361261591n,   95675137928612392156876334331168593412n, 301613873771889848137714364785485714735n, 278224571298089265666737094541710980794n,
    140049647417493050970983064725330334359n,  159594320057012289760186736637936788141n,  44954493393746175043012738454844468290n, 223519669575552375517628855932195463175n
];

// create rescue instance, and use it to calculate key constants for every round of computation
const rescue = new Rescue(field, alpha, invAlpha, 4, roundSteps, mds, constants);
const keyStates = rescue.unrollConstants();
const { roundConstants } = rescue.groupConstants(keyStates);

// STARK DEFINITION
// ================================================================================================
const merkleStark = new Stark(`
define MerkleProof over prime field (2^128 - 9 * 2^32 + 1) {

    alpha: 3;
    inv_alpha: 0-113427455640312821154458202464371168597;

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

    transition 8 registers in ${treeDepth * roundSteps} steps {
        when ($k0) {
            // constants for the hash function
            K1: [$k1, $k2, $k3, $k4];
            K2: [$k5, $k6, $k7, $k8];

            // compute hash(p, v)
            S1: [$r0, $r1, $r2, $r3];
            S1: MDS # S1^alpha + K1;
            S1: MDS # S1^(inv_alpha) + K2;

            // compute hash(v, p)
            S2: [$r4, $r5, $r6, $r7];
            S2: MDS # S2^alpha + K1;
            S2: MDS # S2^(inv_alpha) + K2;

            out: [...S1, ...S2];
        }
        else {
            // this happens every 32nd step

            h: $p0 ? $r4 | $r0;
            S1: [h, $s0, 0, 0];
            S2: [$s0, h, 0, 0];

            out: [...S1, ...S2];
        }
    }

    enforce 8 constraints {
        when ($k0) {
            // constants for the hash function
            K1: [$k1, $k2, $k3, $k4];
            K2: [$k5, $k6, $k7, $k8];

            // constraints for hash(p, v)
            S1: [$r0, $r1, $r2, $r3];
            N1: [$n0, $n1, $n2, $n3];
            S1: MDS # S1^alpha + K1;
            N1: (INV_MDS # (N1 - K2))^alpha;
            T1: S1 - N1;

            // constraints for hash(v, p)
            S2: [$r4, $r5, $r6, $r7];
            N2: [$n4, $n5, $n6, $n7];
            S2: MDS # S2^alpha + K1;
            N2: (INV_MDS # (N2 - K2))^alpha;
            T2: S2 - N2;

            out: [...T1, ...T2];
        }
        else {
            // this happens every 32nd step

            h: $p0 ? $r4 | $r0;

            S1: [h, $s0, 0, 0];
            N1: [$n0, $n1, $n2, $n3];
            T1: S1 - N1;

            S2: [$s0, h, 0, 0];
            N2: [$n4, $n5, $n6, $n7];
            T2: S2 - N2;

            out: [...T1, ...T2];
        }
    }

    using 11 readonly registers {
        // 31 ones followed by a zero - will be used to control conditional expression
        $k0: repeat binary [
            1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0
        ];

        $p0: spread binary [...];   // binary representation of node index
        $s0: spread [...];          // merkle branch nodes

        // constants for Rescue hash function
        $k1: repeat [${roundConstants[0].join(', ')}];
        $k2: repeat [${roundConstants[1].join(', ')}];
        $k3: repeat [${roundConstants[2].join(', ')}];
        $k4: repeat [${roundConstants[3].join(', ')}];
        $k5: repeat [${roundConstants[4].join(', ')}];
        $k6: repeat [${roundConstants[5].join(', ')}];
        $k7: repeat [${roundConstants[6].join(', ')}];
        $k8: repeat [${roundConstants[7].join(', ')}];
    }
}`);

// TESTING
// ================================================================================================
// generate a random merkle tree
const values = field.prng(42n, 2**treeDepth);
const hash = makeHashFunction(rescue, keyStates);
const tree = new MerkleTree(values.toValues(), hash);

// generate a proof for index 42
const index = 42;
const proof = tree.prove(index);
//console.log(MerkleTree.verify(tree.root, index, proof, hash));

// set up inputs and assertions for the STARK
const binaryIndex = toBinaryArray(index, treeDepth);
const initValues = [proof[0], proof[1], 0n, 0n, proof[1], proof[0], 0n, 0n];
const assertions: Assertion[] = [
    { step: roundSteps * treeDepth - 1, register: 0, value: tree.root }
];

// remove first 2 elements since they are already in initValues
const nodes = proof.slice(2);
// add a dummy value at the end so that length of nodes is a power of 2
nodes.push(0n);

// generate a proof
const sProof = merkleStark.prove(assertions, initValues, [binaryIndex], [nodes]);
console.log('-'.repeat(20));

// verify the proof
merkleStark.verify(assertions, sProof, [binaryIndex]);
console.log('-'.repeat(20));
console.log(`Proof size: ${Math.round(merkleStark.sizeOf(sProof) / 1024 * 100) / 100} KB`);

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