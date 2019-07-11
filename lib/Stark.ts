// IMPORTS
// ================================================================================================
import { SecurityOptions, Assertion, HashAlgorithm, StarkProof, Logger as ILogger } from '@guildofweavers/genstark';
import { MerkleTree, BatchMerkleProof, getHashFunction, getHashDigestSize } from '@guildofweavers/merkle';
import { parseScript, AirObject } from '@guildofweavers/air-script';
import { TracePolynomial, ZeroPolynomial, BoundaryConstraints, LowDegreeProver, LinearCombination } from './components';
import { Logger, getPseudorandomIndexes, sizeOf, bigIntsToBuffers, buffersToBigInts } from './utils';
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

    readonly exeQueryCount      : number;

    readonly hashAlgorithm      : HashAlgorithm;

    readonly ldProver           : LowDegreeProver;
    readonly serializer         : Serializer;
    readonly logger             : ILogger;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(source: string, options?: Partial<SecurityOptions>, logger?: ILogger) {

        if (typeof source !== 'string') throw new TypeError('Source script must be a string');
        if (!source.trim()) throw new TypeError('Source script cannot be an empty string');

        const vOptions = validateSecurityOptions(options);
        this.air = parseScript(source, undefined, vOptions.extensionFactor);

        this.exeQueryCount = vOptions.exeQueryCount;
        this.hashAlgorithm = vOptions.hashAlgorithm;
        
        this.ldProver = new LowDegreeProver(vOptions.friQueryCount, this.hashAlgorithm, this.air);
        this.serializer = new Serializer(this.air);
        this.logger = logger || new Logger();
    }

    // PROVER
    // --------------------------------------------------------------------------------------------
    prove(assertions: Assertion[], initValues: bigint[], publicInputs?: bigint[][], secretInputs?: bigint[][]): StarkProof {

        const label = this.logger.start('Starting STARK computation');
        const extensionFactor = this.air.extensionFactor;
    
        // 0 ----- validate parameters
        if (!Array.isArray(assertions)) throw new TypeError('Assertions parameter must be an array');
        if (assertions.length === 0) throw new TypeError('At least one assertion must be provided');
        if (!Array.isArray(initValues)) throw new TypeError('Initialization values parameter must be an array');

        // 1 ----- set up evaluation context
        const context = this.air.createContext(publicInputs || [], secretInputs || []);
        const evaluationDomainSize = context.evaluationDomain.length;
        this.logger.log(label, 'Set up evaluation context');

        // 2 ----- generate execution trace and make sure it is correct
        let executionTrace: bigint[][];
        try {
            executionTrace = this.air.generateExecutionTrace(initValues, context);
        }
        catch (error) {
            throw new StarkError(`Failed to generate the execution trace`, error);
        }

        validateAssertions(executionTrace, assertions);
        this.logger.log(label, 'Generated execution trace');

        // 3 ----- compute P(x) polynomials and low-degree extend them
        const pPoly = new TracePolynomial(context);
        const pEvaluations = pPoly.evaluate(executionTrace);
        this.logger.log(label, 'Converted execution trace into polynomials and low-degree extended them');

        // 4 ----- compute constraint polynomials Q(x) = C(P(x))
        let qEvaluations: bigint[][];
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
        // first, invert numerators of Z(x)
        const zNumInverses = this.air.field.invMany(zEvaluations.numerators);
        this.logger.log(label, 'Inverted Z(x) numerators');

        // then, multiply all values together to compute D(x)
        const zDenominators = zEvaluations.denominators;
        const dEvaluations = this.air.field.mulMany(qEvaluations, zDenominators, zNumInverses);
        this.logger.log(label, 'Computed D(x) polynomials');

        // 7 ----- compute boundary constraints B(x)
        const bPoly = new BoundaryConstraints(assertions, context);
        const bEvaluations = bPoly.evaluateAll(pEvaluations, context.evaluationDomain);
        this.logger.log(label, 'Computed B(x) polynomials');

        // 8 ----- build merkle tree for evaluations of P(x), D(x), and B(x)
        const sEvaluations = new Array<bigint[]>(this.air.secretInputCount);
        // TODO: make evaluations be a part of an explicit interface
        for (let i = 0; i < sEvaluations.length; i++) {
            sEvaluations[i] = (context.sRegisters[i] as any).evaluations;
        }

        const hash = getHashFunction(this.hashAlgorithm);
        const mergedEvaluations = new Array<Buffer>(evaluationDomainSize);
        const hashedEvaluations = new Array<Buffer>(evaluationDomainSize);
        for (let i = 0; i < evaluationDomainSize; i++) {
            let v = this.serializer.mergeValues([pEvaluations, sEvaluations, bEvaluations, dEvaluations], bPoly.count, i);
            mergedEvaluations[i] = v;
            hashedEvaluations[i] = hash(v);
        }
        this.logger.log(label, 'Serialized evaluations of P(x), B(x), and D(x) polynomials');

        const eTree = MerkleTree.create(hashedEvaluations, this.hashAlgorithm);
        this.logger.log(label, 'Built evaluation merkle tree');
        
        // 9 ----- spot check evaluation tree at pseudo-random positions
        const queryCount = Math.min(this.exeQueryCount, evaluationDomainSize - evaluationDomainSize / extensionFactor);
        const positions = getPseudorandomIndexes(eTree.root, queryCount, evaluationDomainSize, extensionFactor);
        const augmentedPositions = this.getAugmentedPositions(positions, evaluationDomainSize);
        const eValues = new Array<Buffer>(augmentedPositions.length);
        for (let i = 0; i < augmentedPositions.length; i++) {
            eValues[i] = mergedEvaluations[augmentedPositions[i]];
        }
        const eProof = eTree.proveBatch(augmentedPositions);
        this.logger.log(label, `Computed ${queryCount} evaluation spot checks`);

        // 10 ---- compute random linear combination of evaluations
        // TODO: include sEvaluations into linear combination
        const lCombination = new LinearCombination(context, eTree.root, this.air.constraintCount, this.air.maxConstraintDegree);
        const lEvaluations = lCombination.computeMany(pEvaluations, sEvaluations, bEvaluations, dEvaluations);;
        this.logger.log(label, 'Computed random linear combination of evaluations');

        // 11 ----- Compute low-degree proof
        const hashDigestSize = getHashDigestSize(this.hashAlgorithm);
        const lEvaluations2 = bigIntsToBuffers(lEvaluations, hashDigestSize)
        const lTree = MerkleTree.create(lEvaluations2, this.hashAlgorithm);
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
            evaluations: {
                root    : eTree.root,
                values  : eValues,
                nodes   : eProof.nodes,
                depth   : eProof.depth,
                bpc     : bPoly.count
            },
            degree: {
                root    : lTree.root,
                lcProof : lcProof,
                ldProof : ldProof
            }
        };
    }
    
    // VERIFIER
    // --------------------------------------------------------------------------------------------
    verify(assertions: Assertion[], proof: StarkProof, publicInputs?: bigint[][]) {

        const label = this.logger.start('Starting STARK verification');
        const eRoot = proof.evaluations.root;
        const extensionFactor = this.air.extensionFactor;

        // 0 ----- validate parameters
        if (assertions.length < 1) throw new TypeError('At least one assertion must be provided');
        
        // 1 ----- set up evaluation context
        const context = this.air.createContext(publicInputs || []);
        const evaluationDomainSize = context.traceLength * extensionFactor;
        const G2 = context.rootOfUnity;

        const bPoly = new BoundaryConstraints(assertions, context);
        const zPoly = new ZeroPolynomial(context);
        this.logger.log(label, 'Set up evaluation context');

        // 2 ----- compute positions for evaluation spot-checks
        const queryCount = Math.min(this.exeQueryCount, evaluationDomainSize - evaluationDomainSize / extensionFactor);
        const positions = getPseudorandomIndexes(eRoot, queryCount, evaluationDomainSize, extensionFactor);
        const augmentedPositions = this.getAugmentedPositions(positions, evaluationDomainSize);
        this.logger.log(label, `Computed positions for evaluation spot checks`);

        // 3 ----- decode evaluation spot-checks
        const pEvaluations = new Map<number, bigint[]>();
        const sEvaluations = new Map<number, bigint[]>();
        const bEvaluations = new Map<number, bigint[]>();
        const dEvaluations = new Map<number, bigint[]>();
        const hashedEvaluations = new Array<Buffer>(augmentedPositions.length);
        const hash = getHashFunction(this.hashAlgorithm);

        for (let i = 0; i < proof.evaluations.values.length; i++) {
            let mergedEvaluations = proof.evaluations.values[i];
            let position = augmentedPositions[i];
            let [p, s, b, d] = this.serializer.parseValues(mergedEvaluations, bPoly.count);
            
            pEvaluations.set(position, p);
            sEvaluations.set(position, s);
            bEvaluations.set(position, b);
            dEvaluations.set(position, d);

            hashedEvaluations[i] = hash(mergedEvaluations);
        }
        this.logger.log(label, `Decoded evaluation spot checks`);

        // 4 ----- verify merkle proof for evaluation tree
        const eProof: BatchMerkleProof = {
            values  : hashedEvaluations,
            nodes   : proof.evaluations.nodes,
            depth   : proof.evaluations.depth
        };
        try {
            if (!MerkleTree.verifyBatch(eRoot, augmentedPositions, eProof, this.hashAlgorithm)) {
                throw new StarkError(`Verification of evaluation Merkle proof failed`);
            }
        }
        catch (error) {
            if (error instanceof StarkError === false) {
                throw new StarkError(`Verification of evaluation Merkle proof failed`, error);
            }
        }
        this.logger.log(label, `Verified evaluation merkle proof`);

        // 5 ----- verify linear combination proof
        try {
            if (!MerkleTree.verifyBatch(proof.degree.root, positions, proof.degree.lcProof, this.hashAlgorithm)) {
                throw new StarkError(`Verification of linear combination Merkle proof failed`);
            }
        }
        catch (error) {
            if (error instanceof StarkError === false) {
                throw new StarkError(`Verification of linear combination Merkle proof failed`, error);
            }
        }

        const lCombination = new LinearCombination(context, proof.evaluations.root, this.air.constraintCount, this.air.maxConstraintDegree);
        const lEvaluations = new Map<number, bigint>();
        const lEvaluationValues = buffersToBigInts(proof.degree.lcProof.values);
        for (let i = 0; i < proof.degree.lcProof.values.length; i++) {
            let position = positions[i];
            lEvaluations.set(position, lEvaluationValues[i]);
        }
        this.logger.log(label, `Verified liner combination proof`);

        // 6 ----- verify low-degree proof
        try {
            this.ldProver.verify(proof.degree.root, lCombination.combinationDegree, G2, proof.degree.ldProof);
        }
        catch (error) {
            throw new StarkError('Verification of low degree failed', error);
        }

        this.logger.log(label, `Verified low-degree proof`);

        // 7 ----- verify transition and boundary constraints
        for (let i = 0; i < positions.length; i++) {
            let step = positions[i];
            let x = this.air.field.exp(G2, BigInt(step));

            let pValues = pEvaluations.get(step)!;
            let bValues = bEvaluations.get(step)!;
            let dValues = dEvaluations.get(step)!;
            let sValues = sEvaluations.get(step)!;
            let zValue = zPoly.evaluateAt(x);

            // check transition 
            let npValues = pEvaluations.get((step + extensionFactor) % evaluationDomainSize)!;
            let qValues = this.air.evaluateConstraintsAt(x, pValues, npValues, sValues, context);
            for (let j = 0; j < qValues.length; j++) {
                let qCheck = this.air.field.mul(zValue, dValues[j]);
                if (qValues[j] !== qCheck) {
                    throw new StarkError(`Transition constraint at position ${step} was not satisfied`);
                }
            }

            // check boundary constraints
            let bChecks = bPoly.evaluateAt(pEvaluations.get(step)!, x);
            for (let j = 0; j < bChecks.length; j++) {
                if (bChecks[j] !== bValues[j]) {
                    throw new StarkError(`Boundary constraint at position ${step} was not satisfied`);
                }
            }

            // check correctness of liner combination
            // TODO: include sValues into the check
            let lCheck = lCombination.computeOne(x, pValues, sValues, bValues, dValues);
            if (lEvaluations.get(step) !== lCheck) {
                throw new StarkError(`Linear combination at position ${step} is inconsistent`);
            }
        }
        this.logger.log(label, `Verified transition and boundary constraints`);

        this.logger.done(label, 'STARK verified');
        return true;
    }

    // UTILITIES
    // --------------------------------------------------------------------------------------------
    sizeOf(proof: StarkProof): number {
        const size = sizeOf(proof, this.hashAlgorithm);
        return size.total;
    }

    serialize(proof: StarkProof) {
        return this.serializer.serializeProof(proof, this.hashAlgorithm);
    }

    parse(buffer: Buffer): StarkProof {
        return this.serializer.parseProof(buffer, this.hashAlgorithm);
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

function validateAssertions(trace: bigint[][], assertions: Assertion[]) {
    const registers = trace.length;
    const steps = trace[0].length;

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
        if (trace[a.register][a.step] !== a.value) {
            throw new StarkError(`Assertion at step ${a.step}, register ${a.register} conflicts with execution trace`);
        }
    }
}