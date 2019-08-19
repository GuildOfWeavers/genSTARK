// IMPORTS
// ================================================================================================
import { SecurityOptions, Assertion, HashAlgorithm, StarkProof, OptimizationOptions, Logger as ILogger } from '@guildofweavers/genstark';
import { MerkleTree, BatchMerkleProof, createHash, isWasmOptimized as isHashWasmOptimized, Hash, WasmOptions } from '@guildofweavers/merkle';
import { parseScript, AirObject, Matrix } from '@guildofweavers/air-script';
import { ZeroPolynomial, BoundaryConstraints, LowDegreeProver, LinearCombination, QueryIndexGenerator } from './components';
import { Logger, sizeOf, vectorToBuffers } from './utils';
import { Serializer } from './Serializer';
import { StarkError } from './StarkError';

// MODULE VARIABLES
// ================================================================================================
const DEFAULT_EXE_QUERY_COUNT = 80;
const DEFAULT_FRI_QUERY_COUNT = 40;

const MAX_EXE_QUERY_COUNT = 128;
const MAX_FRI_QUERY_COUNT = 64;

const HASH_ALGORITHMS: HashAlgorithm[] = ['sha256', 'blake2s256'];
const DEFAULT_HASH_ALGORITHM: HashAlgorithm = 'sha256';

// CLASS DEFINITION
// ================================================================================================
export class Stark {

    readonly air                : AirObject;
    readonly hash               : Hash;

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
        
        if (optimization) {
            const wasmOptions = buildWasmOptions(optimization);

            // instantiate AIR object
            this.air = parseScript(source, undefined, { extensionFactor: sOptions.extensionFactor, wasmOptions });
            if (!this.air.field.isOptimized) {
                console.warn(`WARNING: WebAssembly optimization is not available for prime fields with the specified modulus`);
            }

            // instantiate Hash object
            const memory = new WebAssembly.Memory({ initial: 10 }); // TODO: enable shared memory
            this.hash = createHash(sOptions.hashAlgorithm, { memory });
            if (!this.hash.isOptimized) {
                console.warn(`WARNING: WebAssembly optimization is not available for ${sOptions.hashAlgorithm} hash algorithm`);
            }
        }
        else {
            this.air = parseScript(source, undefined, { extensionFactor: sOptions.extensionFactor });
            this.hash = createHash(sOptions.hashAlgorithm, false);
        }

        this.indexGenerator = new QueryIndexGenerator(this.air.extensionFactor, sOptions);
        this.ldProver = new LowDegreeProver(this.air.field, this.indexGenerator, this.hash);
        this.serializer = new Serializer(this.air);
        this.logger = logger || new Logger();
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
        const context = this.air.createContext(publicInputs || [], secretInputs || []);
        const evaluationDomainSize = context.evaluationDomain.length;
        this.logger.log(label, 'Set up evaluation context');

        // 2 ----- generate execution trace and make sure it is correct
        let executionTrace: Matrix;
        try {
            executionTrace = this.air.generateExecutionTrace(initValues, context);
        }
        catch (error) {
            throw new StarkError(`Failed to generate the execution trace`, error);
        }

        validateAssertions(executionTrace, assertions);
        this.logger.log(label, 'Generated execution trace');

        // 3 ----- compute P(x) polynomials and low-degree extend them
        const pPolys = this.air.field.interpolateRoots(context.executionDomain, executionTrace);
        const pEvaluations = this.air.field.evalPolysAtRoots(pPolys, context.evaluationDomain);
        this.logger.log(label, 'Converted execution trace into polynomials and low-degree extended them');

        // 4 ----- compute constraint polynomials Q(x) = C(P(x))
        let qEvaluations: Matrix;
        try {
            qEvaluations = this.air.evaluateExtendedTrace(pEvaluations, context);
        }
        catch (error) {
            throw new StarkError('Failed to evaluate transition constraints', error);
        }
        this.logger.log(label, 'Computed Q(x) polynomials');

        // 5 ----- compute polynomial Z(x) separately as numerator and denominator
        const zPoly = new ZeroPolynomial(context);
        const zEvaluations = zPoly.evaluateAll(context.evaluationDomain);
        this.logger.log(label, 'Computed Z(x) polynomial');

        // 6 ----- compute D(x) = Q(x) / Z(x)
        // first, compute inverse of Z(x)
        const zInverses = this.air.field.divVectorElements(zEvaluations.denominators, zEvaluations.numerators);
        this.logger.log(label, 'Computed Z(x) inverses');

        // then, multiply all values together to compute D(x)
        const dEvaluations = this.air.field.mulMatrixRows(qEvaluations, zInverses);
        this.logger.log(label, 'Computed D(x) polynomials');

        // 7 ----- compute boundary constraints B(x)
        const bPoly = new BoundaryConstraints(assertions, context);
        const bEvaluations = bPoly.evaluateAll(pEvaluations, context.evaluationDomain);
        this.logger.log(label, 'Computed B(x) polynomials');

        // 8 ----- build merkle tree for evaluations of P(x) and S(x)
        const hashedEvaluations = new Array<Buffer>(evaluationDomainSize);
        for (let i = 0; i < evaluationDomainSize; i++) {
            let v = this.serializer.mergeValues(pEvaluations, context.sEvaluations, i);
            hashedEvaluations[i] = this.hash.digest(v);
        }
        this.logger.log(label, 'Serialized evaluations of P(x) and S(x) polynomials');

        const eTree = MerkleTree.create(hashedEvaluations, this.hash);
        this.logger.log(label, 'Built evaluation merkle tree');
        
        // 9 ----- spot check evaluation tree at pseudo-random positions
        const positions = this.indexGenerator.getExeIndexes(eTree.root, evaluationDomainSize);
        const augmentedPositions = this.getAugmentedPositions(positions, evaluationDomainSize);
        const eValues = new Array<Buffer>(augmentedPositions.length);
        for (let i = 0; i < augmentedPositions.length; i++) {
            let p = augmentedPositions[i];
            eValues[i] = this.serializer.mergeValues(pEvaluations, context.sEvaluations, p);
        }
        const eProof = eTree.proveBatch(augmentedPositions);
        this.logger.log(label, `Computed ${positions.length} evaluation spot checks`);

        // 10 ---- compute random linear combination of evaluations
        const lCombination = new LinearCombination(eTree.root, this.air.constraints, context);
        const lEvaluations = lCombination.computeMany(pEvaluations, context.sEvaluations, bEvaluations, dEvaluations);
        this.logger.log(label, 'Computed random linear combination of evaluations');

        // 11 ----- Compute low-degree proof
        const lEvaluations2 = vectorToBuffers(lEvaluations, this.hash.digestSize);
        const lTree = MerkleTree.create(lEvaluations2, this.hash);
        this.logger.log(label, 'Built liner combination merkle tree');
        const lcProof = lTree.proveBatch(positions);

        let ldProof;
        try {
            ldProof = this.ldProver.prove(lTree, lEvaluations, context.evaluationDomain, lCombination.combinationDegree);
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
        const extensionFactor = this.air.extensionFactor;

        // 0 ----- validate parameters
        if (assertions.length < 1) throw new TypeError('At least one assertion must be provided');
        
        // 1 ----- set up evaluation context
        const context = this.air.createContext(publicInputs || []);
        const evaluationDomainSize = context.traceLength * extensionFactor;

        const bPoly = new BoundaryConstraints(assertions, context);
        const zPoly = new ZeroPolynomial(context);
        const lCombination = new LinearCombination(eRoot, this.air.constraints, context);
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
            this.ldProver.verify(proof.lcProof.root, lCombination.combinationDegree, G2, proof.ldProof);
        }
        catch (error) {
            throw new StarkError('Verification of low degree failed', error);
        }
        this.logger.log(label, `Verified low-degree proof`);

        // 6 ----- compute linear combinations of P, S, B, and D values for all spot checks
        const lcValues = new Array<bigint>(positions.length);
        for (let i = 0; i < positions.length; i++) {
            let step = positions[i];
            let x = this.air.field.exp(context.rootOfUnity, BigInt(step));

            let pValues = pEvaluations.get(step)!;
            let nValues = pEvaluations.get((step + extensionFactor) % evaluationDomainSize)!;
            let sValues = sEvaluations.get(step)!;
            let zValue = zPoly.evaluateAt(x);

            // evaluate constraints and use the result to compute D(x) and B(x)
            let qValues = this.air.evaluateConstraintsAt(x, pValues, nValues, sValues, context);
            let dValues = this.air.field.divVectorElements(this.air.field.newVectorFrom(qValues), zValue).toValues();
            let bValues = bPoly.evaluateAt(pValues, x);

            // compute linear combination of all evaluations
            lcValues[i] = lCombination.computeOne(x, pValues, sValues, bValues, dValues);
        }
        this.logger.log(label, `Verified transition and boundary constraints`);

        // 7 ----- verify linear combination proof
        try {
            const lcProof: BatchMerkleProof = {
                values  : vectorToBuffers(this.air.field.newVectorFrom(lcValues), this.hash.digestSize),
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
        return this.serializer.serializeProof(proof, this.hash.digestSize);
    }

    parse(buffer: Buffer): StarkProof {
        return this.serializer.parseProof(buffer, this.hash.digestSize);
    }

    // HELPER METHODS
    // --------------------------------------------------------------------------------------------
    private getAugmentedPositions(positions: number[], evaluationDomainSize: number): number[] {
        const skip = this.air.extensionFactor;
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
            memory : new WebAssembly.Memory({ initial: 10 })    // TODO: use defaults
        }
    }
    else {
        const initialMemory = options.initialMemory || 10; // TODO: use default
        const memory = new WebAssembly.Memory({ initial: initialMemory, maximum: options.maximumMemory });
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