// IMPORTS
// ================================================================================================
import * as air from '@guildofweavers/air-script';
import { SecurityOptions, HashAlgorithm } from '@guildofweavers/genstark';
import { isPowerOf2 } from './utils';

// MODULE VARIABLES
// ================================================================================================
export const MAX_DOMAIN_SIZE = 2**32;

const DEFAULT_OPTIONS: SecurityOptions = {
    extensionFactor     : 8,
    exeSpotCheckCount   : 80,
    friSpotCheckCount   : 40,
    hashAlgorithm       : 'sha256'
};

const MAX_EXTENSION_FACTOR = 32;
const MAX_EXE_SPOT_CHECK_COUNT = 128;
const MAX_FRI_SPOT_CHECK_COUNT = 64;

const HASH_ALGORITHMS: HashAlgorithm[] = ['sha256', 'blake2s256'];

// PUBLIC FUNCTIONS
// ================================================================================================
export function parseStarkConfig(script: string, options?: SecurityOptions) {

    if (typeof script !== 'string') throw new TypeError('Script parameter must be a string');
    if (!script.trim()) throw new TypeError('Script parameter cannot be an empty string');

    const config = air.parseScript(script);
    options = {...DEFAULT_OPTIONS, ...options };
    
    // extension factor
    let extensionFactor = options.extensionFactor;
    if (extensionFactor === undefined) {
        extensionFactor = 2**Math.ceil(Math.log2(config.maxConstraintDegree * 2));
    }
    else {
        if (extensionFactor < 2 || extensionFactor > MAX_EXTENSION_FACTOR || !Number.isInteger(extensionFactor)) {
            throw new TypeError(`Extension factor must be an integer between 2 and ${MAX_EXTENSION_FACTOR}`);
        }
    
        if (!isPowerOf2(extensionFactor)) {
            throw new TypeError(`Extension factor must be a power of 2`);
        }

        if (extensionFactor < 2 * config.maxConstraintDegree) {
            throw new TypeError(`Extension factor must be at least 2x greater than the transition constraint degree`);
        }
    }

    // execution trace spot checks
    const exeSpotCheckCount = options.exeSpotCheckCount!;
    if (exeSpotCheckCount < 1 || exeSpotCheckCount > MAX_EXE_SPOT_CHECK_COUNT || !Number.isInteger(exeSpotCheckCount)) {
        throw new TypeError(`Execution sample size must be an integer between 1 and ${MAX_EXE_SPOT_CHECK_COUNT}`);
    }

    // low degree evaluation spot checks
    const friSpotCheckCount = options.friSpotCheckCount!;
    if (friSpotCheckCount < 1 || friSpotCheckCount > MAX_FRI_SPOT_CHECK_COUNT || !Number.isInteger(friSpotCheckCount)) {
        throw new TypeError(`FRI sample size must be an integer between 1 and ${MAX_FRI_SPOT_CHECK_COUNT}`);
    }

    // hash function
    const hashAlgorithm = options.hashAlgorithm!;
    if (!HASH_ALGORITHMS.includes(hashAlgorithm)) {
        throw new TypeError(`Hash algorithm ${hashAlgorithm} is not supported`);
    }

    return {
        field                   : config.field,
        roundLength             : config.steps,
        registerCount           : config.mutableRegisterCount,
        constraintCount         : config.constraintCount,
        maxConstraintDegree     : config.maxConstraintDegree,
        transitionFunction      : config.transitionFunction,
        constraintEvaluator     : config.constraintEvaluator,
        roundConstants          : config.readonlyRegisters,
        globalConstants         : config.globalConstants,
        extensionFactor         : extensionFactor,
        exeSpotCheckCount       : exeSpotCheckCount,
        friSpotCheckCount       : friSpotCheckCount,
        hashAlgorithm           : hashAlgorithm
    };
}