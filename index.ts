// IMPORTS
// ================================================================================================
import { OptimizationOptions, SecurityOptions, HashAlgorithm, Logger } from '@guildofweavers/genstark';
import { compile, instantiate, WasmOptions } from '@guildofweavers/air-assembly';
import { Stark } from './lib/Stark';

// RE-EXPORTS
// ================================================================================================
export { Stark } from './lib/Stark';
export { inline } from './lib/utils';
export { MerkleTree, createHash } from '@guildofweavers/merkle';
export { createPrimeField } from '@guildofweavers/galois';

// MODULE VARIABLES
// ================================================================================================
const DEFAULT_EXE_QUERY_COUNT = 80;
const DEFAULT_FRI_QUERY_COUNT = 40;

const MAX_EXE_QUERY_COUNT = 128;
const MAX_FRI_QUERY_COUNT = 64;

const HASH_ALGORITHMS: HashAlgorithm[] = ['sha256', 'blake2s256'];
const DEFAULT_HASH_ALGORITHM: HashAlgorithm = 'sha256';

const WASM_PAGE_SIZE = 65536;                               // 64 KB
const DEFAULT_INITIAL_MEMORY = 32 * 2**20;                  // 32 MB
const DEFAULT_MAXIMUM_MEMORY = 2 * 2**30 - WASM_PAGE_SIZE;  // 2 GB less one page

// PUBLIC FUNCTIONS
// ================================================================================================
export function createStark(source: Buffer | string, security?: Partial<SecurityOptions>, optimization?: boolean | Partial<OptimizationOptions>, logger?: Logger) {

    const extensionFactor = security ? security.extensionFactor : undefined;
    const wasmOptions = optimization ? buildWasmOptions(optimization) : undefined;
    
    // instantiate AIR module
    const schema = compile(source as any);
    const air = instantiate(schema, { extensionFactor, wasmOptions });
    if (optimization && !air.field.isOptimized) {
        console.warn(`WARNING: WebAssembly optimization is not available for the specified field`);
    }

    const sOptions = validateSecurityOptions(security, air.extensionFactor);

    return new Stark(air, sOptions, logger);
}

// HELPER FUNCTIONS
// ================================================================================================
function validateSecurityOptions(options: Partial<SecurityOptions> | undefined, extensionFactor: number): SecurityOptions {

    // execution trace spot checks
    const exeQueryCount = (options ? options.exeQueryCount : undefined) || DEFAULT_EXE_QUERY_COUNT;
    if (exeQueryCount < 1 || exeQueryCount > MAX_EXE_QUERY_COUNT || !Number.isInteger(exeQueryCount)) {
        throw new TypeError(`Execution sample size must be an integer between 1 and ${MAX_EXE_QUERY_COUNT}`);
    }

    // low degree evaluation spot checks
    const friQueryCount = (options ? options.friQueryCount : undefined) || DEFAULT_FRI_QUERY_COUNT;
    if (friQueryCount < 1 || friQueryCount > MAX_FRI_QUERY_COUNT || !Number.isInteger(friQueryCount)) {
        throw new TypeError(`FRI sample size must be an integer between 1 and ${MAX_FRI_QUERY_COUNT}`);
    }

    // hash function
    const hashAlgorithm = (options ? options.hashAlgorithm : undefined) || DEFAULT_HASH_ALGORITHM;
    if (!HASH_ALGORITHMS.includes(hashAlgorithm)) {
        throw new TypeError(`Hash algorithm ${hashAlgorithm} is not supported`);
    }

    // extension factor
    if (!extensionFactor) {
        throw new TypeError(`Extension factor is undefined`);
    }

    return { extensionFactor, exeQueryCount, friQueryCount, hashAlgorithm };
}

function buildWasmOptions(options: Partial<OptimizationOptions> | boolean): WasmOptions {
    if (typeof options === 'boolean') {
        return {
            memory : new WebAssembly.Memory({
                initial: Math.ceil(DEFAULT_INITIAL_MEMORY / WASM_PAGE_SIZE),
                maximum: Math.ceil(DEFAULT_MAXIMUM_MEMORY / WASM_PAGE_SIZE)
            })
        }
    }
    else {
        const initialMemory = Math.ceil((options.initialMemory || DEFAULT_INITIAL_MEMORY) / WASM_PAGE_SIZE);
        const maximumMemory = Math.ceil((options.maximumMemory || DEFAULT_MAXIMUM_MEMORY) / WASM_PAGE_SIZE);
        const memory = new WebAssembly.Memory({ initial: initialMemory, maximum: maximumMemory });
        return { memory };
    }
}