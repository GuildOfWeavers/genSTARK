"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const index_1 = require("../../index");
const utils_1 = require("./utils");
// STARK PARAMETERS
// ================================================================================================
const field = index_1.createPrimeField(2n ** 128n - 9n * 2n ** 32n + 1n);
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
const { initialConstants, roundConstants } = rescue.groupConstants(keyStates);
// STARK DEFINITION
// ================================================================================================
const rescueStark = new index_1.Stark(`
define Rescue4x128 over prime field (2^128 - 9 * 2^32 + 1) {

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

    transition 4 registers {
        for each ($i0, $i1, $i2, $i3) {
            init [$i0, $i1, $i2, $i3];

            for steps [1..31] {
                S <- MDS # $r^alpha + $k[0..3];
                MDS # (/S)^(inv_alpha) + $k[4..7];
            }
        }
    }

    enforce 4 constraints {
        for each ($i0, $i1, $i2, $i3) {
            init {
                [$i0, $i1, $i2, $i3] = $n;
            }

            for steps [1..31] {
                S <- MDS # $r^alpha + $k[0..3];
                N <- (INV_MDS # ($n - $k[4..7]))^alpha;
                S = N;
            }
        }
    }

    using 8 readonly registers {
        $k0: repeat [${roundConstants[0].join(', ')}];
        $k1: repeat [${roundConstants[1].join(', ')}];
        $k2: repeat [${roundConstants[2].join(', ')}];
        $k3: repeat [${roundConstants[3].join(', ')}];
        $k4: repeat [${roundConstants[4].join(', ')}];
        $k5: repeat [${roundConstants[5].join(', ')}];
        $k6: repeat [${roundConstants[6].join(', ')}];
        $k7: repeat [${roundConstants[7].join(', ')}];
    }
}`);
// TESTING
// ================================================================================================
// set up inputs and assertions
const initValues = [buildInputs([42n, 43n])];
const assertions = [
    { step: steps - 1, register: 0, value: 302524937772545017647250309501879538110n },
    { step: steps - 1, register: 1, value: 205025454306577433144586673939030012640n },
];
// generate a proof
const proof = rescueStark.prove(assertions, initValues);
console.log('-'.repeat(20));
// verify the proof
rescueStark.verify(assertions, proof);
console.log('-'.repeat(20));
console.log(`Proof size: ${Math.round(rescueStark.sizeOf(proof) / 1024 * 100) / 100} KB`);
// HELPER FUNCTIONS
// ================================================================================================
function buildInputs(values) {
    const r = [
        field.add(values[0], initialConstants[0]),
        field.add(values[1], initialConstants[1]),
        initialConstants[2],
        initialConstants[3]
    ];
    // first step of round 1
    const a = [
        field.exp(r[0], invAlpha),
        field.exp(r[1], invAlpha),
        field.exp(r[2], invAlpha),
        field.exp(r[3], invAlpha)
    ];
    for (let i = 0; i < 4; i++) {
        let sum = 0n;
        for (let j = 0; j < 4; j++) {
            sum = field.add(sum, field.mul(mds[i][j], a[j]));
        }
        r[i] = sum;
    }
    r[0] = field.add(r[0], initialConstants[4]);
    r[1] = field.add(r[1], initialConstants[5]);
    r[2] = field.add(r[2], initialConstants[6]);
    r[3] = field.add(r[3], initialConstants[7]);
    return r;
}
//# sourceMappingURL=hash4x128.js.map