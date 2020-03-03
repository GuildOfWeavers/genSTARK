// IMPORTS
// ================================================================================================
import { StarkOptions } from '@guildofweavers/genstark';
import { createPrimeField, instantiate } from '../../index';
import { prng } from '@guildofweavers/air-assembly';
import { transpose, getMdsMatrix } from '../poseidon/utils';
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
const roundSteps = fRounds + pRounds + 1;

const mds = getMdsMatrix(field, stateWidth);

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
    wasm            : true
};

const hashStark = instantiate('./assembly/lib224.aa', 'ComputePoseidonHash', options, new Logger(false));

console.log('done!')