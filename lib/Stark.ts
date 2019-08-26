// IMPORTS
// ================================================================================================
import { SecurityOptions, Assertion, HashAlgorithm, StarkProof, OptimizationOptions, Logger as ILogger } from '@guildofweavers/genstark';
import { MerkleTree, BatchMerkleProof, createHash, Hash, WasmOptions } from '@guildofweavers/merkle';
import { parseScript, AirObject, Matrix } from '@guildofweavers/air-script';
import { CompositionPolynomial, LowDegreeProver, LinearCombination, QueryIndexGenerator } from './components';
import { Logger, sizeOf, bigIntsToBuffers, powLog2 } from './utils';
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

    readonly air                : AirObject;
    readonly hash               : Hash;

    readonly extensionFactor    : number;

    readonly indexGenerator     : QueryIndexGenerator;
    readonly ldProver           : LowDegreeProver;
    readonly serializer         : Serializer;
    readonly logger             : ILogger;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(source: string, security?: Partial<SecurityOptions>, optimization?: boolean | Partial<OptimizationOptions>, logger?: ILogger) {

        if (typeof source !== 'string') throw new TypeError('Source script must be a string');
        if (!source.trim()) throw new TypeError('Source script cannot be an empty string');

        const sOptions = validateSecurityOptions(security);
        this.extensionFactor = sOptions.extensionFactor || 16; // TODO
        
        if (optimization) {
            const wasmOptions = buildWasmOptions(optimization);

            // instantiate AIR object
            this.air = parseScript(source, undefined, wasmOptions);
            if (!this.air.field.isOptimized) {
                console.warn(`WARNING: WebAssembly optimization is not available for the specified field`);
            }

            // instantiate Hash object
            const wasmOptions2 = buildWasmOptions(optimization); // TODO: use the same options as for AIR
            this.hash = createHash(sOptions.hashAlgorithm, wasmOptions2);
            if (!this.hash.isOptimized) {
                console.warn(`WARNING: WebAssembly optimization is not available for ${sOptions.hashAlgorithm} hash algorithm`);
            }
        }
        else {
            this.air = parseScript(source);
            this.hash = createHash(sOptions.hashAlgorithm, false);
        }

        this.indexGenerator = new QueryIndexGenerator(this.extensionFactor, sOptions);
        this.ldProver = new LowDegreeProver(this.air.field, this.indexGenerator, this.hash);
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
    prove(assertions: Assertion[], initValues: bigint[], publicInputs?: bigint[][], secretInputs?: bigint[][]): StarkProof {

        const label = this.logger.start('Starting STARK computation');
    
        // 0 ----- validate parameters
        if (!Array.isArray(assertions)) throw new TypeError('Assertions parameter must be an array');
        if (assertions.length === 0) throw new TypeError('At least one assertion must be provided');
        if (!Array.isArray(initValues)) throw new TypeError('Initialization values parameter must be an array');

        // 1 ----- set up evaluation context
        const field = this.air.field;
        const context = this.air.createContext(publicInputs || [], secretInputs || [], this.extensionFactor);
        const evaluationDomainSize = context.evaluationDomain.length;
        this.logger.log(label, 'Set up evaluation context');

        // 2 ----- generate execution trace and make sure it is correct
        let executionTrace: Matrix;
        try {
            executionTrace = context.generateExecutionTrace(initValues);
            validateAssertions(executionTrace, assertions);
        }
        catch (error) {
            throw new StarkError(`Failed to generate the execution trace`, error);
        }
        this.logger.log(label, 'Generated execution trace');
        
        // 3 ----- compute P(x) polynomials and low-degree extend them
        const pPolys = field.interpolateRoots(context.executionDomain, executionTrace);
        this.logger.log(label, 'Computed execution trace polynomials P(x)');

        const pEvaluations = field.evalPolysAtRoots(pPolys, context.evaluationDomain);
        this.logger.log(label, 'Low-degree extended P(x) polynomials over evaluation domain');

        // 4 ----- build merkle tree for evaluations of P(x) and S(x)
        const sEvaluations = context.getSecretRegisterTraces();
        const eVectors = [...field.matrixRowsToVectors(pEvaluations), ...sEvaluations];
        const hashedEvaluations = this.hash.mergeVectorRows(eVectors);
        this.logger.log(label, 'Serialized evaluations of P(x) and S(x) polynomials');

        const eTree = MerkleTree.create(hashedEvaluations, this.hash);
        this.logger.log(label, 'Built evaluation merkle tree');

        // 5 ----- spot check evaluation tree at pseudo-random positions
        const positions = this.indexGenerator.getExeIndexes(eTree.root, evaluationDomainSize);
        const augmentedPositions = this.getAugmentedPositions(positions, evaluationDomainSize);
        const eValues = new Array<Buffer>(augmentedPositions.length);
        for (let i = 0; i < augmentedPositions.length; i++) {
            let p = augmentedPositions[i];
            eValues[i] = this.serializer.mergeValues(pEvaluations, sEvaluations, p);
        }
        const eProof = eTree.proveBatch(augmentedPositions);
        this.logger.log(label, `Computed ${positions.length} evaluation spot checks`);

        // 6 ----- compute composition polynomial D(x)
        const cPoly = new CompositionPolynomial(this.air.constraints, assertions, eTree.root, context);
        const cEvaluations = cPoly.evaluateAll(pPolys, pEvaluations, context);

        // 7 ---- compute random linear combination of evaluations
        const lCombination = new LinearCombination(eTree.root, cPoly.compositionDegree, cPoly.coefficientCount, context);
        const lEvaluations = lCombination.computeMany(cEvaluations, pEvaluations, sEvaluations);
        this.logger.log(label, 'Computed random linear combination of evaluations');

        // 8 ----- Compute low-degree proof
        const lTree = MerkleTree.create(lEvaluations, this.hash);
        this.logger.log(label, 'Built liner combination merkle tree');
        const lcProof = lTree.proveBatch(positions);

        let ldProof;
        try {
            ldProof = this.ldProver.prove(lTree, lEvaluations, context.evaluationDomain, cPoly.compositionDegree);
        }
        catch (error) {
            throw new StarkError('Low degree proof failed', error);
        }
        this.logger.log(label, 'Computed low-degree proof');

        this.logger.done(label, 'STARK computed');

        // build and return the proof object
        return {
            values      : eValues,
            evProof: {
                root    : eTree.root,
                nodes   : eProof.nodes,
                depth   : eProof.depth
            },
            lcProof: {
                root    : lTree.root,
                nodes   : lcProof.nodes,
                depth   : lcProof.depth
            },
            ldProof     : ldProof
        };
    }

    // VERIFIER
    // --------------------------------------------------------------------------------------------
    verify(assertions: Assertion[], proof: StarkProof, publicInputs?: bigint[][]) {

        const label = this.logger.start('Starting STARK verification');
        const eRoot = proof.evProof.root;
        const extensionFactor = this.extensionFactor;
        const field = this.air.field;

        // 0 ----- validate parameters
        if (assertions.length < 1) throw new TypeError('At least one assertion must be provided');
        
        // 1 ----- set up evaluation context
        const context = this.air.createContext(publicInputs || [], extensionFactor);
        const evaluationDomainSize = context.traceLength * extensionFactor;

        const cPoly = new CompositionPolynomial(this.air.constraints, assertions, eRoot, context);
        const lCombination = new LinearCombination(eRoot, cPoly.compositionDegree, cPoly.coefficientCount, context);
        this.logger.log(label, 'Set up evaluation context');

        // 2 ----- compute positions for evaluation spot-checks
        const positions = this.indexGenerator.getExeIndexes(eRoot, evaluationDomainSize);
        const augmentedPositions = this.getAugmentedPositions(positions, evaluationDomainSize);
        this.logger.log(label, `Computed positions for evaluation spot checks`);

        // 3 ----- decode evaluation spot-checks
        const pEvaluations = new Map<number, bigint[]>();
        const sEvaluations = new Map<number, bigint[]>();
        const hashedEvaluations = new Array<Buffer>(augmentedPositions.length);

        for (let i = 0; i < proof.values.length; i++) {
            let mergedEvaluations = proof.values[i];
            let position = augmentedPositions[i];
            let [p, s] = this.serializer.parseValues(mergedEvaluations);
            
            pEvaluations.set(position, p);
            sEvaluations.set(position, s);

            hashedEvaluations[i] = this.hash.digest(mergedEvaluations);
        }
        this.logger.log(label, `Decoded evaluation spot checks`);

        // 4 ----- verify merkle proof for evaluation tree
        try {
            const evProof: BatchMerkleProof = {
                values  : hashedEvaluations,
                nodes   : proof.evProof.nodes,
                depth   : proof.evProof.depth
            };
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
        this.logger.log(label, `Verified evaluation merkle proof`);

        // 5 ----- verify low-degree proof
        try {
            const G2 = context.rootOfUnity;
            this.ldProver.verify(proof.lcProof.root, cPoly.compositionDegree, G2, proof.ldProof);
        }
        catch (error) {
            throw new StarkError('Verification of low degree failed', error);
        }
        this.logger.log(label, `Verified low-degree proof`);

        // 6 ----- compute linear combinations of P, S, B, and D values for all spot checks
        const lcValues = new Array<bigint>(positions.length);
        for (let i = 0; i < positions.length; i++) {
            let step = positions[i];
            let x = field.exp(context.rootOfUnity, BigInt(step));

            let pValues = pEvaluations.get(step)!;
            let nValues = pEvaluations.get((step + extensionFactor) % evaluationDomainSize)!;
            let sValues = sEvaluations.get(step)!;

            // evaluate constraints and use the result to compute D(x) and B(x)
            let cValue = cPoly.evaluateAt(x, pValues, nValues, sValues, context);

            // compute linear combination of all evaluations
            lcValues[i] = lCombination.computeOne(x, cValue, pValues, sValues);
        }
        this.logger.log(label, `Verified transition and boundary constraints`);

        // 7 ----- verify linear combination proof
        try {
            const lcProof: BatchMerkleProof = {
                values  : bigIntsToBuffers(lcValues, field.elementSize),
                nodes   : proof.lcProof.nodes,
                depth   : proof.lcProof.depth
            };
            if (!MerkleTree.verifyBatch(proof.lcProof.root, positions, lcProof, this.hash)) {
                throw new StarkError(`Verification of linear combination Merkle proof failed`);
            }
        }
        catch (error) {
            if (error instanceof StarkError === false) {
                error = new StarkError(`Verification of linear combination Merkle proof failed`, error);
            }
            throw error;
        }
        this.logger.log(label, `Verified liner combination merkle proof`);

        this.logger.done(label, 'STARK verified');
        return true;
    }

    // UTILITIES
    // --------------------------------------------------------------------------------------------
    sizeOf(proof: StarkProof): number {
        const size = sizeOf(proof, this.hash.digestSize);
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
}

// HELPER FUNCTIONS
// ================================================================================================
function validateSecurityOptions(options?: Partial<SecurityOptions>): SecurityOptions {

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

    const extensionFactor = (options ? options.extensionFactor : undefined);
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