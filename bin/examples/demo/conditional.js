"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../../index");
const utils_1 = require("../rescue/utils");
// STARK PARAMETERS
// ================================================================================================
const field = new index_1.PrimeField(2n ** 128n - 9n * 2n ** 32n + 1n);
const rounds = 16;
const steps = 32;
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
const rescue = new utils_1.Rescue(field, alpha, invAlpha, 4, steps, mds, constants);
const keyStates = rescue.unrollConstants();
const { roundConstants } = rescue.groupConstants(keyStates);
// STARK DEFINITION
// ================================================================================================
const rescueStark = new index_1.Stark(`
define Demo over prime field (2^128 - 9 * 2^32 + 1) {

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

    transition 4 registers in ${rounds * steps} steps {
        when ($k0) {
            // use secret registers as inputs for the first step
            S: [$s0, $s1, 0, 0];
            K1: [$k1, $k2, $k3, $k4];
            K2: [$k5, $k6, $k7, $k8];
    
            S: MDS # S^alpha + K1;
            out: MDS # S^(inv_alpha) + K2;            
        }
        else {
            S: [$r0, $r1, $r2, $r3];
            K1: [$k1, $k2, $k3, $k4];
            K2: [$k5, $k6, $k7, $k8];
    
            S: MDS # S^alpha + K1;
            out: MDS # S^(inv_alpha) + K2;
        }
    }

    enforce 4 constraints {
        when ($k0) {
            S: [$s0, $s1, 0, 0];
            N: [$n0, $n1, $n2, $n3];
            K1: [$k1, $k2, $k3, $k4];
            K2: [$k5, $k6, $k7, $k8];

            T1: MDS # S^alpha + K1;
            T2: (INV_MDS # (N - K2))^alpha;

            out: T1 - T2;
        }
        else {
            S: [$r0, $r1, $r2, $r3];
            N: [$n0, $n1, $n2, $n3];
            K1: [$k1, $k2, $k3, $k4];
            K2: [$k5, $k6, $k7, $k8];
    
            T1: MDS # S^alpha + K1;
            T2: (INV_MDS # (N - K2))^alpha;
    
            out: T1 - T2;
        }
    }

    using 11 readonly registers {
        // 31 ones followed by a zero - will be used to control conditional expression
        $k0: repeat binary [
            1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
        ];

        // inputs to be hashed
        $s0: spread [...];
        $s1: spread [...];

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
// set up inputs and assertions
let initValues = [0n, 0n, 0n, 0n];
const secretInputs = [[], []];
const assertions = [];
for (let i = 0; i < rounds; i++) {
    let v1 = BigInt(i), v2 = BigInt(i) ** 2n;
    secretInputs[0].push(v1);
    secretInputs[1].push(v2);
    let result = rescue.modifiedSponge([v1, v2, 0n, 0n], keyStates).hash;
    let step = (i + 1) * 32 - 1;
    assertions.push({ step, register: 0, value: result[0] });
    assertions.push({ step, register: 1, value: result[1] });
}
// generate a proof
const proof = rescueStark.prove(assertions, initValues, [], secretInputs);
console.log('-'.repeat(20));
// verify the proof
rescueStark.verify(assertions, proof);
console.log('-'.repeat(20));
console.log(`Proof size: ${Math.round(rescueStark.sizeOf(proof) / 1024 * 100) / 100} KB`);
//# sourceMappingURL=conditional.js.map