// IMPORTS
// ================================================================================================
import { SecurityOptions, Assertion, HashAlgorithm, StarkProof, OptimizationOptions, Logger as ILogger } from '@guildofweavers/genstark';
import { MerkleTree, createHash, Hash, WasmOptions } from '@guildofweavers/merkle';
import { parseScript, Vector, Matrix, AirModule } from '@guildofweavers/air-script';
import { CompositionPolynomial, LowDegreeProver, LinearCombination, QueryIndexGenerator } from './components';
import { Logger, sizeOf, powLog2, readBigInt, rehashMerkleProofValues, noop } from './utils';
import { Serializer } from './Serializer';
import { StarkError } from './StarkError';

// MODULE VARIABLES
// ================================================================================================
const DEFAULT_EXE_QUERY_COUNT = 80;
const DEFAULT_FRI_QUERY_COUNT = 40;

const MAX_EXE_QUERY_COUNT = 128;
const MAX_FRI_QUERY_COUNT = 64;

const WASM_PAGE_SIZE = 65536;                               // 64 KB
const DEFAULT_INITIAL_MEMORY = 32 * 2**20;                  // 32 MB
const DEFAULT_MAXIMUM_MEMORY = 2 * 2**30 - WASM_PAGE_SIZE;  // 2 GB less one page

const HASH_ALGORITHMS: HashAlgorithm[] = ['sha256', 'blake2s256'];
const DEFAULT_HASH_ALGORITHM: HashAlgorithm = 'sha256';

// CLASS DEFINITION
// ================================================================================================
export class Stark {

    readonly air                : AirModule;
    readonly hash               : Hash;

    readonly extensionFactor    : number;

    readonly indexGenerator     : QueryIndexGenerator;
    readonly serializer         : Serializer;
    readonly logger             : ILogger;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(source: string, security?: Partial<SecurityOptions>, optimization?: boolean | Partial<OptimizationOptions>, logger?: ILogger) {

        if (typeof source !== 'string') throw new TypeError('Source script must be a string');
        if (!source.trim()) throw new TypeError('Source script cannot be an empty string');

        let extensionFactor = security ? security.extensionFactor : undefined;
        let sOptions: SecurityOptions;
        if (optimization) {
            const wasmOptions = buildWasmOptions(optimization);

            // instantiate AIR module
            this.air = parseScript(source, { wasmOptions, extensionFactor });
            if (!this.air.field.isOptimized) {
                console.warn(`WARNING: WebAssembly optimization is not available for the specified field`);
            }

            // instantiate Hash object
            sOptions = validateSecurityOptions(security, this.air.extensionFactor);
            const wasmOptions2 = buildWasmOptions(optimization); // TODO: use the same options as for AIR
            this.hash = createHash(sOptions.hashAlgorithm, wasmOptions2);
            if (!this.hash.isOptimized) {
                console.warn(`WARNING: WebAssembly optimization is not available for ${sOptions.hashAlgorithm} hash algorithm`);
            }
        }
        else {
            this.air = parseScript(source, { extensionFactor });
            sOptions = validateSecurityOptions(security, this.air.extensionFactor);
            this.hash = createHash(sOptions.hashAlgorithm, false);
        }

        this.extensionFactor = sOptions.extensionFactor;
        this.indexGenerator = new QueryIndexGenerator(sOptions);
        this.serializer = new Serializer(this.air, this.hash.digestSize);
        this.logger = logger || new Logger();
    }

    // ACCESSORS
    // --------------------------------------------------------------------------------------------
    get securityLevel(): number {
        const extensionFactor = this.extensionFactor;

        // execution trace security
        const exeQueryCount = this.indexGenerator.exeQueryCount;
        const es = powLog2(extensionFactor / this.air.maxConstraintDegree, exeQueryCount);

        // FRI proof security
        const friQueryCount = this.indexGenerator.friQueryCount;
        const fs = Math.log2(extensionFactor) * friQueryCount;

        // collision resistance of hash function
        const hs = this.hash.digestSize * 4;

        return Math.floor(Math.min(es, fs, hs));
    }

    // PROVER
    // --------------------------------------------------------------------------------------------
    prove(assertions: Assertion[], inputs: any[], auxPublicInputs?: bigint[][], auxSecretInputs?: bigint[][]): StarkProof {

        const log = this.logger.start('Starting STARK computation');
    
        // 0 ----- validate parameters
        if (!Array.isArray(assertions)) throw new TypeError('Assertions parameter must be an array');
        if (assertions.length === 0) throw new TypeError('At least one assertion must be provided');
        if (!Array.isArray(inputs)) throw new TypeError('Initialization values parameter must be an array');

        // 1 ----- set up evaluation context
        const field = this.air.field;
        const context = this.air.initProof(inputs, auxPublicInputs || [], auxSecretInputs || []);
        const evaluationDomainSize = context.evaluationDomain.length;
        log('Set up evaluation context');

        // 2 ----- generate execution trace and make sure it is correct
        let executionTrace: Matrix;
        try {
            executionTrace = context.generateExecutionTrace();
            validateAssertions(executionTrace, assertions);
        }
        catch (error) {
            throw new StarkError(`Failed to generate the execution trace`, error);
        }
        log('Generated execution trace');
        
        // 3 ----- compute P(x) polynomials and low-degree extend them
        const pPolys = field.interpolateRoots(context.executionDomain, executionTrace);
        log('Computed execution trace polynomials P(x)');

        const pEvaluations = field.evalPolysAtRoots(pPolys, context.evaluationDomain);
        log('Low-degree extended P(x) polynomials over evaluation domain');

        // 4 ----- build merkle tree for evaluations of P(x) and S(x)
        const hEvaluations = context.hiddenRegisterTraces;
        const eVectors = [...field.matrixRowsToVectors(pEvaluations), ...hEvaluations];
        const hashedEvaluations = this.hash.mergeVectorRows(eVectors);
        log('Serialized evaluations of P(x) and S(x) polynomials');

        const eTree = MerkleTree.create(hashedEvaluations, this.hash);
        log('Built evaluation merkle tree');

        // 5 ----- compute composition polynomial C(x)
        const cLogger = this.logger.sub('Computing composition polynomial');
        const cPoly = new CompositionPolynomial(this.air.constraints, assertions, eTree.root, context, cLogger);
        const cEvaluations = cPoly.evaluateAll(pPolys, pEvaluations, context);
        this.logger.done(cLogger);
        log('Computed composition polynomial C(x)');

        // 6 ---- compute random linear combination of evaluations
        const lCombination = new LinearCombination(eTree.root, cPoly.compositionDegree, cPoly.coefficientCount, context);
        const lEvaluations = lCombination.computeMany(cEvaluations, pEvaluations, hEvaluations);
        log('Combined P(x) and S(x) evaluations with C(x) evaluations');

        // 7 ----- Compute low-degree proof
        let ldProof;
        try {
            const ldLogger = this.logger.sub('Computing low degree proof');
            const ldProver = new LowDegreeProver(this.indexGenerator, this.hash, context, ldLogger);
            ldProof = ldProver.prove(lEvaluations, context.evaluationDomain, cPoly.compositionDegree);
            this.logger.done(ldLogger);
            log('Computed low-degree proof');
        }
        catch (error) {
            throw new StarkError('Low degree proof failed', error);
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
            evRoot      : eTree.root,
            evProof     : eProof,
            ldProof     : ldProof,
            traceShape  : context.traceShape
        };
    }

    // VERIFIER
    // --------------------------------------------------------------------------------------------
    verify(assertions: Assertion[], proof: StarkProof, auxPublicInputs?: bigint[][]) {

        const log = this.logger.start('Starting STARK verification');
        
        // 0 ----- validate parameters
        if (assertions.length < 1) throw new TypeError('At least one assertion must be provided');
        
        // 1 ----- set up evaluation context
        const field = this.air.field;
        const eRoot = proof.evRoot;
        const extensionFactor = this.extensionFactor;
        const context = this.air.initVerification(proof.traceShape, auxPublicInputs || []);
        const evaluationDomainSize = context.traceLength * extensionFactor;

        const cPoly = new CompositionPolynomial(this.air.constraints, assertions, eRoot, context, noop);
        const lCombination = new LinearCombination(eRoot, cPoly.compositionDegree, cPoly.coefficientCount, context);
        log('Set up evaluation context');

        // 2 ----- compute positions for evaluation spot-checks
        const positions = this.indexGenerator.getExeIndexes(proof.ldProof.lcRoot, evaluationDomainSize);
        const augmentedPositions = this.getAugmentedPositions(positions, evaluationDomainSize);
        log(`Computed positions for evaluation spot checks`);

        // 3 ----- decode evaluation spot-checks
        const pEvaluations = new Map<number, bigint[]>();
        const hEvaluations = new Map<number, bigint[]>();

        for (let i = 0; i < proof.evProof.values.length; i++) {
            let mergedEvaluations = proof.evProof.values[i];
            let position = augmentedPositions[i];
            let [p, h] = this.parseValues(mergedEvaluations);
            
            pEvaluations.set(position, p);
            hEvaluations.set(position, h);
        }
        log(`Decoded evaluation spot checks`);

        // 4 ----- verify merkle proof for evaluation tree
        try {
            const evProof = rehashMerkleProofValues(proof.evProof, this.hash);
            if (!MerkleTree.verifyBatch(eRoot, augmentedPositions, evProof, this.hash)) {
                throw new StarkError(`Verification of evaluation Merkle proof failed`);
            }
        }
        catch (error) {
            if (error instanceof StarkError === false) {
                error = new StarkError(`Verification of evaluation Merkle proof failed`, error);
            }
            throw error;
        }
        log(`Verified evaluation merkle proof`);

        // 5 ----- compute linear combinations of C, P, and S values for all spot checks
        const lcValues = new Array<bigint>(positions.length);
        for (let i = 0; i < positions.length; i++) {
            let step = positions[i];
            let x = field.exp(context.rootOfUnity, BigInt(step));

            let pValues = pEvaluations.get(step)!;
            let nValues = pEvaluations.get((step + extensionFactor) % evaluationDomainSize)!;
            let hValues = hEvaluations.get(step)!;

            // evaluate composition polynomial at x
            let cValue = cPoly.evaluateAt(x, pValues, nValues, hValues, context);

            // combine composition polynomial evaluation with values of P(x) and S(x)
            lcValues[i] = lCombination.computeOne(x, cValue, pValues, hValues);
        }
        log(`Verified transition and boundary constraints`);

        // 6 ----- verify low-degree proof
        try {
            const ldProver = new LowDegreeProver(this.indexGenerator, this.hash, context, noop);
            ldProver.verify(proof.ldProof, lcValues, positions, cPoly.compositionDegree);
        }
        catch (error) {
            throw new StarkError('Verification of low degree failed', error);
        }
        log(`Verified low-degree proof`);

        this.logger.done(log, 'STARK verified');
        return true;
    }

    // UTILITIES
    // --------------------------------------------------------------------------------------------
    sizeOf(proof: StarkProof): number {
        const size = sizeOf(proof, this.air.field.elementSize, this.hash.digestSize);
        return size.total;
    }

    serialize(proof: StarkProof) {
        return this.serializer.serializeProof(proof);
    }

    parse(buffer: Buffer): StarkProof {
        return this.serializer.parseProof(buffer);
    }

    // HELPER METHODS
    // --------------------------------------------------------------------------------------------
    private getAugmentedPositions(positions: number[], evaluationDomainSize: number): number[] {
        const skip = this.extensionFactor;
        const augmentedPositionSet = new Set<number>();
        for (let i = 0; i < positions.length; i++) {
            augmentedPositionSet.add(positions[i]);
            augmentedPositionSet.add((positions[i] + skip) % evaluationDomainSize);
        }
        return Array.from(augmentedPositionSet);
    }

    private mergeValues(values: Vector[], positions: number[]): Buffer[] {
        const bufferSize = values.length * this.air.field.elementSize;
        const result: Buffer[] = [];
        for (let position of positions) {
            let buffer = Buffer.allocUnsafe(bufferSize), offset = 0;
            for (let vector of values) {
                offset += vector.copyValue(position, buffer, offset);
            }
            result.push(buffer);
        }
    
        return result;
    }

    private parseValues(buffer: Buffer): [bigint[], bigint[]] {
        const elementSize = this.air.field.elementSize;
        const stateWidth = this.air.stateWidth;
        const sRegisterCount = this.air.sRegisterCount;
        const iRegisterCount = this.air.iRegisterCount;

        let offset = 0;

        const pValues = new Array<bigint>(stateWidth);
        for (let i = 0; i < pValues.length; i++, offset += elementSize) {
            pValues[i] = readBigInt(buffer, offset, elementSize);
        }

        const hValues = new Array<bigint>(sRegisterCount + iRegisterCount);
        for (let i = 0; i < hValues.length; i++, offset += elementSize) {
            hValues[i] = readBigInt(buffer, offset, elementSize);
        }

        return [pValues, hValues];
    }
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

function validateAssertions(trace: Matrix, assertions: Assertion[]) {
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
            throw new StarkError(`Assertion at step ${a.step}, register ${a.register} conflicts with execution trace`);
        }
    }
}