"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("../../index");
const air_assembly_1 = require("@guildofweavers/air-assembly");
const utils_1 = require("../poseidon/utils");
const utils_2 = require("../../lib/utils");
// MODULE VARIABLES
// ================================================================================================
const modulus = 2n ** 224n - 2n ** 96n + 1n;
const field = index_1.createPrimeField(modulus);
// Poseidon constants
const sBoxExp = 5n;
const stateWidth = 3;
const fRounds = 8;
const pRounds = 55;
const roundSteps = fRounds + pRounds + 1;
const mds = utils_1.getMdsMatrix(field, stateWidth);
// build round constants for the hash function
const roundConstants = utils_1.transpose([
    air_assembly_1.prng.sha256(Buffer.from('486164657331', 'hex'), 64, field),
    air_assembly_1.prng.sha256(Buffer.from('486164657332', 'hex'), 64, field),
    air_assembly_1.prng.sha256(Buffer.from('486164657333', 'hex'), 64, field)
]);
// STARK DEFINITIONS
// ================================================================================================
const options = {
    hashAlgorithm: 'blake2s256',
    extensionFactor: 32,
    exeQueryCount: 44,
    friQueryCount: 20,
    wasm: true
};
const hashStark = index_1.instantiate('./assembly/lib224.aa', 'ComputePoseidonHash', options, new utils_2.Logger(false));
console.log('done!');
//# sourceMappingURL=lib224.js.map