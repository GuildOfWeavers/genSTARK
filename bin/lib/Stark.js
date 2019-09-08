"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const merkle_1 = require("@guildofweavers/merkle");
const air_script_1 = require("@guildofweavers/air-script");
const components_1 = require("./components");
const utils_1 = require("./utils");
const Serializer_1 = require("./Serializer");
const StarkError_1 = require("./StarkError");
// MODULE VARIABLES
// ================================================================================================
const DEFAULT_EXE_QUERY_COUNT = 80;
const DEFAULT_FRI_QUERY_COUNT = 40;
const MAX_EXE_QUERY_COUNT = 128;
const MAX_FRI_QUERY_COUNT = 64;
const WASM_PAGE_SIZE = 65536; // 64 KB
const DEFAULT_INITIAL_MEMORY = 32 * 2 ** 20; // 32 MB
const DEFAULT_MAXIMUM_MEMORY = 2 * 2 ** 30 - WASM_PAGE_SIZE; // 2 GB less one page
const HASH_ALGORITHMS = ['sha256', 'blake2s256'];
const DEFAULT_HASH_ALGORITHM = 'sha256';
// CLASS DEFINITION
// ================================================================================================
class Stark {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(source, security, optimization, logger) {
        if (typeof source !== 'string')
            throw new TypeError('Source script must be a string');
        if (!source.trim())
            throw new TypeError('Source script cannot be an empty string');
        let sOptions;
        if (optimization) {
            const wasmOptions = buildWasmOptions(optimization);
            // instantiate AIR object
            this.air = air_script_1.parseScript(source, undefined, wasmOptions);
            if (!this.air.field.isOptimized) {
                console.warn(`WARNING: WebAssembly optimization is not available for the specified field`);
            }
            // instantiate Hash object
            sOptions = validateSecurityOptions(security, this.air.maxConstraintDegree);
            const wasmOptions2 = buildWasmOptions(optimization); // TODO: use the same options as for AIR
            this.hash = merkle_1.createHash(sOptions.hashAlgorithm, wasmOptions2);
            if (!this.hash.isOptimized) {
                console.warn(`WARNING: WebAssembly optimization is not available for ${sOptions.hashAlgorithm} hash algorithm`);
            }
        }
        else {
            this.air = air_script_1.parseScript(source);
            sOptions = validateSecurityOptions(security, this.air.maxConstraintDegree);
            this.hash = merkle_1.createHash(sOptions.hashAlgorithm, false);
        }
        this.extensionFactor = sOptions.extensionFactor;
        this.indexGenerator = new components_1.QueryIndexGenerator(sOptions);
        this.serializer = new Serializer_1.Serializer(this.air, this.hash.digestSize);
        this.logger = logger || new utils_1.Logger();
    }
    // ACCESSORS
    // --------------------------------------------------------------------------------------------
    get securityLevel() {
        const extensionFactor = this.extensionFactor;
        // execution trace security
        const exeQueryCount = this.indexGenerator.exeQueryCount;
        const es = utils_1.powLog2(extensionFactor / this.air.maxConstraintDegree, exeQueryCount);
        // FRI proof security
        const friQueryCount = this.indexGenerator.friQueryCount;
        const fs = Math.log2(extensionFactor) * friQueryCount;
        // collision resistance of hash function
        const hs = this.hash.digestSize * 4;
        return Math.floor(Math.min(es, fs, hs));
    }
    // PROVER
    // --------------------------------------------------------------------------------------------
    prove(assertions, initValues, publicInputs, secretInputs) {
        const log = this.logger.start('Starting STARK computation');
        // 0 ----- validate parameters
        if (!Array.isArray(assertions))
            throw new TypeError('Assertions parameter must be an array');
        if (assertions.length === 0)
            throw new TypeError('At least one assertion must be provided');
        if (!Array.isArray(initValues))
            throw new TypeError('Initialization values parameter must be an array');
        // 1 ----- set up evaluation context
        const field = this.air.field;
        const context = this.air.createContext(publicInputs || [], secretInputs || [], this.extensionFactor);
        const evaluationDomainSize = context.evaluationDomain.length;
        log('Set up evaluation context');
        // 2 ----- generate execution trace and make sure it is correct
        let executionTrace;
        try {
            executionTrace = context.generateExecutionTrace(initValues);
            validateAssertions(executionTrace, assertions);
        }
        catch (error) {
            throw new StarkError_1.StarkError(`Failed to generate the execution trace`, error);
        }
        log('Generated execution trace');
        // 3 ----- compute P(x) polynomials and low-degree extend them
        const pPolys = field.interpolateRoots(context.executionDomain, executionTrace);
        log('Computed execution trace polynomials P(x)');
        const pEvaluations = field.evalPolysAtRoots(pPolys, context.evaluationDomain);
        log('Low-degree extended P(x) polynomials over evaluation domain');
        // 4 ----- build merkle tree for evaluations of P(x) and S(x)
        const sEvaluations = context.getSecretRegisterTraces();
        const eVectors = [...field.matrixRowsToVectors(pEvaluations), ...sEvaluations];
        const hashedEvaluations = this.hash.mergeVectorRows(eVectors);
        log('Serialized evaluations of P(x) and S(x) polynomials');
        const eTree = merkle_1.MerkleTree.create(hashedEvaluations, this.hash);
        log('Built evaluation merkle tree');
        // 5 ----- compute composition polynomial C(x)
        const cLogger = this.logger.sub('Computing composition polynomial');
        const cPoly = new components_1.CompositionPolynomial(this.air.constraints, assertions, eTree.root, context, cLogger);
        const cEvaluations = cPoly.evaluateAll(pPolys, pEvaluations, context);
        this.logger.done(cLogger);
        log('Computed composition polynomial C(x)');
        // 6 ---- compute random linear combination of evaluations
        const lCombination = new components_1.LinearCombination(eTree.root, cPoly.compositionDegree, cPoly.coefficientCount, context);
        const lEvaluations = lCombination.computeMany(cEvaluations, pEvaluations, sEvaluations);
        log('Combined P(x) and S(x) evaluations with C(x) evaluations');
        // 7 ----- Compute low-degree proof
        let ldProof;
        try {
            const ldLogger = this.logger.sub('Computing low degree proof');
            const ldProver = new components_1.LowDegreeProver(this.indexGenerator, this.hash, context, ldLogger);
            ldProof = ldProver.prove(lEvaluations, context.evaluationDomain, cPoly.compositionDegree);
            this.logger.done(ldLogger);
            log('Computed low-degree proof');
        }
        catch (error) {
            throw new StarkError_1.StarkError('Low degree proof failed', error);
        }
        // 8 ----- query evaluation tree at pseudo-random positions
        const positions = this.indexGenerator.getExeIndexes(ldProof.lcRoot, evaluationDomainSize);
        const augmentedPositions = this.getAugmentedPositions(positions, evaluationDomainSize);
        const eValues = this.mergeValues(eVectors, augmentedPositions);
        const eProof = eTree.proveBatch(augmentedPositions);
        eProof.values = eValues;
        log(`Computed ${positions.length} evaluation spot checks`);
        this.logger.done(log, 'STARK computed');
        // build and return the proof object
        return {
            evRoot: eTree.root,
            evProof: eProof,
            ldProof: ldProof
        };
    }
    // VERIFIER
    // --------------------------------------------------------------------------------------------
    verify(assertions, proof, publicInputs) {
        const log = this.logger.start('Starting STARK verification');
        // 0 ----- validate parameters
        if (assertions.length < 1)
            throw new TypeError('At least one assertion must be provided');
        // 1 ----- set up evaluation context
        const field = this.air.field;
        const eRoot = proof.evRoot;
        const extensionFactor = this.extensionFactor;
        const context = this.air.createContext(publicInputs || [], extensionFactor);
        const evaluationDomainSize = context.traceLength * extensionFactor;
        const cPoly = new components_1.CompositionPolynomial(this.air.constraints, assertions, eRoot, context, utils_1.noop);
        const lCombination = new components_1.LinearCombination(eRoot, cPoly.compositionDegree, cPoly.coefficientCount, context);
        log('Set up evaluation context');
        // 2 ----- compute positions for evaluation spot-checks
        const positions = this.indexGenerator.getExeIndexes(proof.ldProof.lcRoot, evaluationDomainSize);
        const augmentedPositions = this.getAugmentedPositions(positions, evaluationDomainSize);
        log(`Computed positions for evaluation spot checks`);
        // 3 ----- decode evaluation spot-checks
        const pEvaluations = new Map();
        const sEvaluations = new Map();
        for (let i = 0; i < proof.evProof.values.length; i++) {
            let mergedEvaluations = proof.evProof.values[i];
            let position = augmentedPositions[i];
            let [p, s] = this.parseValues(mergedEvaluations);
            pEvaluations.set(position, p);
            sEvaluations.set(position, s);
        }
        log(`Decoded evaluation spot checks`);
        // 4 ----- verify merkle proof for evaluation tree
        try {
            const evProof = utils_1.rehashMerkleProofValues(proof.evProof, this.hash);
            if (!merkle_1.MerkleTree.verifyBatch(eRoot, augmentedPositions, evProof, this.hash)) {
                throw new StarkError_1.StarkError(`Verification of evaluation Merkle proof failed`);
            }
        }
        catch (error) {
            if (error instanceof StarkError_1.StarkError === false) {
                error = new StarkError_1.StarkError(`Verification of evaluation Merkle proof failed`, error);
            }
            throw error;
        }
        log(`Verified evaluation merkle proof`);
        // 5 ----- compute linear combinations of C, P, and S values for all spot checks
        const lcValues = new Array(positions.length);
        for (let i = 0; i < positions.length; i++) {
            let step = positions[i];
            let x = field.exp(context.rootOfUnity, BigInt(step));
            let pValues = pEvaluations.get(step);
            let nValues = pEvaluations.get((step + extensionFactor) % evaluationDomainSize);
            let sValues = sEvaluations.get(step);
            // evaluate composition polynomial at x
            let cValue = cPoly.evaluateAt(x, pValues, nValues, sValues, context);
            // combine composition polynomial evaluation with values of P(x) and S(x)
            lcValues[i] = lCombination.computeOne(x, cValue, pValues, sValues);
        }
        log(`Verified transition and boundary constraints`);
        // 6 ----- verify low-degree proof
        try {
            const ldProver = new components_1.LowDegreeProver(this.indexGenerator, this.hash, context, utils_1.noop);
            ldProver.verify(proof.ldProof, lcValues, positions, cPoly.compositionDegree);
        }
        catch (error) {
            throw new StarkError_1.StarkError('Verification of low degree failed', error);
        }
        log(`Verified low-degree proof`);
        this.logger.done(log, 'STARK verified');
        return true;
    }
    // UTILITIES
    // --------------------------------------------------------------------------------------------
    sizeOf(proof) {
        const size = utils_1.sizeOf(proof, this.air.field.elementSize, this.hash.digestSize);
        return size.total;
    }
    serialize(proof) {
        return this.serializer.serializeProof(proof);
    }
    parse(buffer) {
        return this.serializer.parseProof(buffer);
    }
    // HELPER METHODS
    // --------------------------------------------------------------------------------------------
    getAugmentedPositions(positions, evaluationDomainSize) {
        const skip = this.extensionFactor;
        const augmentedPositionSet = new Set();
        for (let i = 0; i < positions.length; i++) {
            augmentedPositionSet.add(positions[i]);
            augmentedPositionSet.add((positions[i] + skip) % evaluationDomainSize);
        }
        return Array.from(augmentedPositionSet);
    }
    mergeValues(values, positions) {
        const bufferSize = values.length * this.air.field.elementSize;
        const result = [];
        for (let position of positions) {
            let buffer = Buffer.allocUnsafe(bufferSize), offset = 0;
            for (let vector of values) {
                offset += vector.copyValue(position, buffer, offset);
            }
            result.push(buffer);
        }
        return result;
    }
    parseValues(buffer) {
        const elementSize = this.air.field.elementSize;
        const stateWidth = this.air.stateWidth;
        const secretInputCount = this.air.secretInputCount;
        let offset = 0;
        const pValues = new Array(stateWidth);
        for (let i = 0; i < stateWidth; i++, offset += elementSize) {
            pValues[i] = utils_1.readBigInt(buffer, offset, elementSize);
        }
        const sValues = new Array(secretInputCount);
        for (let i = 0; i < secretInputCount; i++, offset += elementSize) {
            sValues[i] = utils_1.readBigInt(buffer, offset, elementSize);
        }
        return [pValues, sValues];
    }
}
exports.Stark = Stark;
// HELPER FUNCTIONS
// ================================================================================================
function validateSecurityOptions(options, maxConstraintDegree) {
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
    let extensionFactor = (options ? options.extensionFactor : undefined);
    if (!extensionFactor) {
        extensionFactor = 2 ** (Math.ceil(Math.log2(maxConstraintDegree)) + 1);
    }
    return { extensionFactor, exeQueryCount, friQueryCount, hashAlgorithm };
}
function buildWasmOptions(options) {
    if (typeof options === 'boolean') {
        return {
            memory: new WebAssembly.Memory({
                initial: Math.ceil(DEFAULT_INITIAL_MEMORY / WASM_PAGE_SIZE),
                maximum: Math.ceil(DEFAULT_MAXIMUM_MEMORY / WASM_PAGE_SIZE)
            })
        };
    }
    else {
        const initialMemory = Math.ceil((options.initialMemory || DEFAULT_INITIAL_MEMORY) / WASM_PAGE_SIZE);
        const maximumMemory = Math.ceil((options.maximumMemory || DEFAULT_MAXIMUM_MEMORY) / WASM_PAGE_SIZE);
        const memory = new WebAssembly.Memory({ initial: initialMemory, maximum: maximumMemory });
        return { memory };
    }
}
function validateAssertions(trace, assertions) {
    const registers = trace.rowCount;
    const steps = trace.colCount;
    for (let a of assertions) {
        // make sure register references are correct
        if (a.register < 0 || a.register >= registers) {
            throw new Error(`Invalid assertion: register ${a.register} is outside of register bank`);
        }
        // make sure steps are correct
        if (a.step < 0 || a.step >= steps) {
            throw new Error(`Invalid assertion: step ${a.step} is outside of execution trace`);
        }
        // make sure assertions don't contradict execution trace
        if (trace.getValue(a.register, a.step) !== a.value) {
            throw new StarkError_1.StarkError(`Assertion at step ${a.step}, register ${a.register} conflicts with execution trace`);
        }
    }
}
//# sourceMappingURL=Stark.js.map