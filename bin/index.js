"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const air_assembly_1 = require("@guildofweavers/air-assembly");
const Stark_1 = require("./lib/Stark");
// RE-EXPORTS
// ================================================================================================
var Stark_2 = require("./lib/Stark");
exports.Stark = Stark_2.Stark;
var utils_1 = require("./lib/utils");
exports.inline = utils_1.inline;
var merkle_1 = require("@guildofweavers/merkle");
exports.MerkleTree = merkle_1.MerkleTree;
exports.createHash = merkle_1.createHash;
var galois_1 = require("@guildofweavers/galois");
exports.createPrimeField = galois_1.createPrimeField;
// MODULE VARIABLES
// ================================================================================================
const DEFAULT_EXE_QUERY_COUNT = 80;
const DEFAULT_FRI_QUERY_COUNT = 40;
const MAX_EXE_QUERY_COUNT = 128;
const MAX_FRI_QUERY_COUNT = 64;
const HASH_ALGORITHMS = ['sha256', 'blake2s256'];
const DEFAULT_HASH_ALGORITHM = 'sha256';
const WASM_PAGE_SIZE = 65536; // 64 KB
const DEFAULT_INITIAL_MEMORY = 32 * 2 ** 20; // 32 MB
const DEFAULT_MAXIMUM_MEMORY = 2 * 2 ** 30 - WASM_PAGE_SIZE; // 2 GB less one page
// PUBLIC FUNCTIONS
// ================================================================================================
function instantiate(source, options, useWasm, logger) {
    const extensionFactor = options ? options.extensionFactor : undefined;
    const wasmOptions = useWasm ? buildWasmOptions() : undefined;
    // instantiate AIR module
    const schema = air_assembly_1.compile(source);
    const air = air_assembly_1.instantiate(schema, { extensionFactor, wasmOptions });
    if (useWasm && !air.field.isOptimized) {
        console.warn(`WARNING: WebAssembly optimization is not available for the specified field`);
    }
    const sOptions = validateStarkOptions(options, air.extensionFactor);
    return new Stark_1.Stark(air, sOptions, logger);
}
exports.instantiate = instantiate;
// HELPER FUNCTIONS
// ================================================================================================
function validateStarkOptions(options, extensionFactor) {
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
function buildWasmOptions() {
    return {
        memory: new WebAssembly.Memory({
            initial: Math.ceil(DEFAULT_INITIAL_MEMORY / WASM_PAGE_SIZE),
            maximum: Math.ceil(DEFAULT_MAXIMUM_MEMORY / WASM_PAGE_SIZE)
        })
    };
}
//# sourceMappingURL=index.js.map