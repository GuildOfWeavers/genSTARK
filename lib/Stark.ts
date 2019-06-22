// IMPORTS
// ================================================================================================
import {
    SecurityOptions, FiniteField, Assertion, HashAlgorithm, StarkProof, BatchMerkleProof,
    EvaluationContext, ComputedRegister, Logger as ILogger
} from '@guildofweavers/genstark';
import { MerkleTree, getHashFunction, getHashDigestSize } from '@guildofweavers/merkle';
import { parseScript, ReadonlyRegisterSpecs, StarkConfig } from '@guildofweavers/air-script';
import {
    ExecutionTraceBuilder, TracePolynomial, TransitionConstraintEvaluator, ZeroPolynomial, 
    BoundaryConstraints, LowDegreeProver, LinearCombination
} from './components';
import { Logger, isPowerOf2, getPseudorandomIndexes, sizeOf, bigIntsToBuffers, buffersToBigInts } from './utils';
import { RepeatedConstants, SpreadConstants } from './registers';
import { Serializer } from './Serializer';
import { StarkError } from './StarkError';

// MODULE VARIABLES
// ================================================================================================
const MAX_DOMAIN_SIZE = 2**32;

const DEFAULT_EXE_SPOT_CHECKS = 80;
const DEFAULT_FRI_SPOT_CHECKS = 40;

const MAX_EXTENSION_FACTOR = 32;
const MAX_EXE_SPOT_CHECK_COUNT = 128;
const MAX_FRI_SPOT_CHECK_COUNT = 64;

const HASH_ALGORITHMS: HashAlgorithm[] = ['sha256', 'blake2s256'];

// CLASS DEFINITION
// ================================================================================================
export class Stark {

    readonly field                  : FiniteField;
    readonly config                 : StarkConfig;

    readonly extensionFactor        : number;
    readonly exeSpotCheckCount      : number;
    readonly friSpotCheckCount      : number;

    readonly hashAlgorithm          : HashAlgorithm;
    readonly logger                 : ILogger;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(source: string, options?: Partial<SecurityOptions>, logger?: ILogger) {

        if (typeof source !== 'string') throw new TypeError('Source script must be a string');
        if (!source.trim()) throw new TypeError('Source script cannot be an empty string');
        this.config = parseScript(source);
        this.field = this.config.field;

        const vOptions = validateSecurityOptions(options, this.config.maxConstraintDegree);

        this.extensionFactor = vOptions.extensionFactor;
        this.exeSpotCheckCount = vOptions.exeSpotCheckCount;
        this.friSpotCheckCount = vOptions.friSpotCheckCount;

        this.hashAlgorithm = vOptions.hashAlgorithm;
        this.logger = logger || new Logger();
    }

    // PROVER
    // --------------------------------------------------------------------------------------------
    prove(assertions: Assertion[], inputs: bigint[] | bigint[][]): StarkProof {

        const label = this.logger.start('Starting STARK computation');
        const registerCount = this.config.mutableRegisterCount;
        const constraintCount = this.config.constraintCount;
    
        // 0 ----- validate parameters
        if (!Array.isArray(assertions)) throw new TypeError('Assertions parameter must be an array');
        if (assertions.length === 0) throw new TypeError('At least one assertion must be provided');
        if (!Array.isArray(inputs)) throw new TypeError('Inputs parameter must be an array');
        if (inputs.length === 0) throw new TypeError('At least one input must be provided');

        // 1 ----- set up evaluation context
        const normalizedInputs = normalizeInputs(inputs, registerCount);
        const iterations = normalizedInputs.length;

        const context = this.createContext(iterations);
        const evaluationDomain = this.field.getPowerCycle(context.rootOfUnity);
        const evaluationDomainSize = evaluationDomain.length;

        const kRegisters = buildReadonlyRegisters(this.config.readonlyRegisters, context, evaluationDomain);                
        this.logger.log(label, 'Set up evaluation context');

        // 2 ----- generate execution trace and make sure it is correct
        const traceBuilder = new ExecutionTraceBuilder(this.config, context);
        const executionTrace = traceBuilder.compute(normalizedInputs, kRegisters);
        traceBuilder.validateAssertions(executionTrace, assertions);
        this.logger.log(label, 'Generated execution trace');

        // 3 ----- compute P(x) polynomials and low-degree extend them
        const pPoly = new TracePolynomial(context, executionTrace);
        const pEvaluations = pPoly.evaluate(evaluationDomain);
        this.logger.log(label, 'Converted execution trace into polynomials and low-degree extended them');

        // 4 ----- compute constraint polynomials Q(x) = C(P(x))
        const constraintEvaluator = new TransitionConstraintEvaluator(this.config, context);
        const qEvaluations = constraintEvaluator.evaluateAll(pEvaluations, kRegisters);
        this.logger.log(label, 'Computed Q(x) polynomials');

        // 5 ----- compute polynomial Z(x) separately as numerator and denominator
        const zPoly = new ZeroPolynomial(context);
        const zEvaluations = zPoly.evaluateAll(evaluationDomain);
        this.logger.log(label, 'Computed Z(x) polynomial');

        // 6 ----- compute D(x) = Q(x) / Z(x)
        // first, invert numerators of Z(x)
        const zNumInverses = this.field.invMany(zEvaluations.numerators);
        this.logger.log(label, 'Inverted Z(x) numerators');

        // then, multiply all values together to compute D(x)
        const zDenominators = zEvaluations.denominators;
        const dEvaluations = this.field.mulMany(qEvaluations, zDenominators, zNumInverses);
        this.logger.log(label, 'Computed D(x) polynomials');

        // 7 ----- compute boundary constraints B(x)
        const bPoly = new BoundaryConstraints(assertions, context);
        const bEvaluations = bPoly.evaluateAll(pEvaluations, evaluationDomain);
        this.logger.log(label, 'Computed B(x) polynomials');

        // 8 ----- build merkle tree for evaluations of P(x), D(x), and B(x)
        const hash = getHashFunction(this.hashAlgorithm);
        const serializer = new Serializer(this.field, registerCount, constraintCount);
        const mergedEvaluations = new Array<Buffer>(evaluationDomainSize);
        const hashedEvaluations = new Array<Buffer>(evaluationDomainSize);
        for (let i = 0; i < evaluationDomainSize; i++) {
            let v = serializer.mergeEvaluations([pEvaluations, bEvaluations, dEvaluations], bPoly.count, i);
            mergedEvaluations[i] = v;
            hashedEvaluations[i] = hash(v);
        }
        this.logger.log(label, 'Serialized evaluations of P(x), B(x), and D(x) polynomials');

        const eTree = MerkleTree.create(hashedEvaluations, this.hashAlgorithm);
        this.logger.log(label, 'Built evaluation merkle tree');
        
        // 9 ----- spot check evaluation tree at pseudo-random positions
        const spotCheckCount = Math.min(this.exeSpotCheckCount, evaluationDomainSize - evaluationDomainSize / this.extensionFactor);
        const positions = getPseudorandomIndexes(eTree.root, spotCheckCount, evaluationDomainSize, this.extensionFactor);
        const augmentedPositions = this.getAugmentedPositions(positions, evaluationDomainSize);
        const eValues = new Array<Buffer>(augmentedPositions.length);
        for (let i = 0; i < augmentedPositions.length; i++) {
            eValues[i] = mergedEvaluations[augmentedPositions[i]];
        }
        const eProof = eTree.proveBatch(augmentedPositions);
        this.logger.log(label, `Computed ${spotCheckCount} evaluation spot checks`);

        // 10 ---- compute random linear combination of evaluations
        const lCombination = new LinearCombination(context, eTree.root);
        const lEvaluations = lCombination.computeMany(pEvaluations, bEvaluations, dEvaluations);;
        this.logger.log(label, 'Computed random linear combination of evaluations');

        // 11 ----- Compute low-degree proof
        const hashDigestSize = getHashDigestSize(this.hashAlgorithm);
        const lEvaluations2 = bigIntsToBuffers(lEvaluations, hashDigestSize)
        const lTree = MerkleTree.create(lEvaluations2, this.hashAlgorithm);
        const lcProof = lTree.proveBatch(positions);
        let ldProof;
        try {
            const ldProver = new LowDegreeProver(this.friSpotCheckCount, context);
            ldProof = ldProver.prove(lTree, lEvaluations, evaluationDomain, lCombination.degree);
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
    verify(assertions: Assertion[], proof: StarkProof, iterations = 1) {

        const label = this.logger.start('Starting STARK verification');
        const registerCount = this.config.mutableRegisterCount;
        const constraintCount = this.config.constraintCount;
        const eRoot = proof.evaluations.root;

        // 0 ----- validate parameters
        if (assertions.length < 1) throw new TypeError('At least one assertion must be provided');
        
        // 1 ----- set up evaluation context
        const context = this.createContext(iterations);
        const evaluationDomainSize = context.totalSteps * this.extensionFactor;
        const G2 = context.rootOfUnity;

        const bPoly = new BoundaryConstraints(assertions, context);
        const zPoly = new ZeroPolynomial(context);
        const kRegisters = buildReadonlyRegisters(this.config.readonlyRegisters, context);
        this.logger.log(label, 'Set up evaluation context');

        // 2 ----- compute positions for evaluation spot-checks
        const spotCheckCount = Math.min(this.exeSpotCheckCount, evaluationDomainSize - evaluationDomainSize / this.extensionFactor);
        const positions = getPseudorandomIndexes(eRoot, spotCheckCount, evaluationDomainSize, this.extensionFactor);
        const augmentedPositions = this.getAugmentedPositions(positions, evaluationDomainSize);
        this.logger.log(label, `Computed positions for evaluation spot checks`);

        // 3 ----- decode evaluation spot-checks
        const pEvaluations = new Map<number, bigint[]>();
        const bEvaluations = new Map<number, bigint[]>();
        const dEvaluations = new Map<number, bigint[]>();
        const hashedEvaluations = new Array<Buffer>(augmentedPositions.length);
        const hash = getHashFunction(this.hashAlgorithm);
        const serializer = new Serializer(this.field, registerCount, constraintCount);

        for (let i = 0; i < proof.evaluations.values.length; i++) {
            let mergedEvaluations = proof.evaluations.values[i];
            let position = augmentedPositions[i];
            let [p, b, d] = serializer.parseEvaluations(mergedEvaluations, bPoly.count);
            
            pEvaluations.set(position, p);
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

        const lCombination = new LinearCombination(context, proof.evaluations.root);
        const lEvaluations = new Map<number, bigint>();
        const lEvaluationValues = buffersToBigInts(proof.degree.lcProof.values);
        for (let i = 0; i < proof.degree.lcProof.values.length; i++) {
            let position = positions[i];
            lEvaluations.set(position, lEvaluationValues[i]);
        }
        this.logger.log(label, `Verified liner combination proof`);

        // 6 ----- verify low-degree proof
        try {
            const ldProver = new LowDegreeProver(this.friSpotCheckCount, context);
            ldProver.verify(proof.degree.root, lCombination.degree, G2, proof.degree.ldProof);
        }
        catch (error) {
            throw new StarkError('Verification of low degree failed', error);
        }

        this.logger.log(label, `Verified low-degree proof`);

        // 7 ----- verify transition and boundary constraints
        const constraintEvaluator = new TransitionConstraintEvaluator(this.config, context);
        for (let i = 0; i < positions.length; i++) {
            let step = positions[i];
            let x = this.field.exp(G2, BigInt(step));

            let pValues = pEvaluations.get(step)!;
            let bValues = bEvaluations.get(step)!;
            let dValues = dEvaluations.get(step)!;
            let zValue = zPoly.evaluateAt(x);

            // build an array of constant values for the current step
            let kValues = new Array<bigint>(context.constantCount);
            for (let j = 0; j < kValues.length; j++) {
                kValues[j] = kRegisters[j].getValueAt(x);
            }

            // check transition 
            let npValues = pEvaluations.get((step + this.extensionFactor) % evaluationDomainSize)!;
            let qValues = constraintEvaluator.evaluateOne(pValues, npValues, kValues, step);
            for (let j = 0; j < constraintCount; j++) {
                let qCheck = this.field.mul(zValue, dValues[j]);
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

            // check correctness of liner 
            let lCheck = lCombination.computeOne(x, pValues, bValues, dValues);
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
        const registerCount = this.config.mutableRegisterCount;
        const constraintCount = this.config.constraintCount;
        const valueCount = registerCount + constraintCount + proof.evaluations.bpc; 
        const valueSize = valueCount * this.field.elementSize;
        const size = sizeOf(proof, valueSize, this.hashAlgorithm);
        return size.total;
    }

    serialize(proof: StarkProof) {
        const registerCount = this.config.mutableRegisterCount;
        const constraintCount = this.config.constraintCount;
        const serializer = new Serializer(this.field, registerCount, constraintCount);
        return serializer.serializeProof(proof, this.hashAlgorithm);
    }

    parse(buffer: Buffer): StarkProof {
        const registerCount = this.config.mutableRegisterCount;
        const constraintCount = this.config.constraintCount;
        const serializer = new Serializer(this.field, registerCount, constraintCount);
        return serializer.parseProof(buffer, this.hashAlgorithm);
    }

    // HELPER METHODS
    // --------------------------------------------------------------------------------------------
    private createContext(iterations: number): EvaluationContext {
        // TODO: if (!isPowerOf2(iterations)) throw new TypeError('Number of iterations must be a power of 2');
        // TODO: const maxSteps = MAX_DOMAIN_SIZE / this.extensionFactor;
        // TODO: if (steps > maxSteps) throw new TypeError(`Total number of steps cannot exceed ${maxSteps}`);
        const steps = this.config.steps * iterations;
        const domainSize = steps * this.extensionFactor;
        const rootOfUnity = this.field.getRootOfUnity(domainSize);
        const maxConstraintDegree = this.config.maxConstraintDegree;

        return {
            field               : this.field,
            constraintDegree    : iterations === 1 ? maxConstraintDegree : maxConstraintDegree + 1,
            roundSteps          : this.config.steps,
            totalSteps          : steps,
            domainSize          : domainSize,
            rootOfUnity         : rootOfUnity,
            registerCount       : this.config.mutableRegisterCount,
            constantCount       : this.config.readonlyRegisters.length,
            hashAlgorithm       : this.hashAlgorithm
        };
    }

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
function validateSecurityOptions(options: Partial<SecurityOptions> | undefined, maxConstraintDegree: number): SecurityOptions {

    // extension factor
    const minExtensionFactor = 2**Math.ceil(Math.log2((maxConstraintDegree + 1) * 2));
    let extensionFactor = options ? options.extensionFactor : undefined;
    if (extensionFactor === undefined) {
        extensionFactor = minExtensionFactor;
        if (extensionFactor > MAX_EXTENSION_FACTOR) {
            throw new TypeError(`Transition constraints degree must be smaller than or equal to ${MAX_EXTENSION_FACTOR / 2 - 1}`);
        }
    }
    else {
        if (extensionFactor > MAX_EXTENSION_FACTOR || !Number.isInteger(extensionFactor)) {
            throw new TypeError(`Extension factor must be an integer smaller than or equal to ${MAX_EXTENSION_FACTOR}`);
        }
    
        if (!isPowerOf2(extensionFactor)) {
            throw new TypeError(`Extension factor must be a power of 2`);
        }

        if (extensionFactor < minExtensionFactor) {
            throw new TypeError(`Extension factor must be at ${minExtensionFactor}`);
        }
    }

    // execution trace spot checks
    const exeSpotCheckCount = (options ? options.exeSpotCheckCount : undefined) || DEFAULT_EXE_SPOT_CHECKS;
    if (exeSpotCheckCount < 1 || exeSpotCheckCount > MAX_EXE_SPOT_CHECK_COUNT || !Number.isInteger(exeSpotCheckCount)) {
        throw new TypeError(`Execution sample size must be an integer between 1 and ${MAX_EXE_SPOT_CHECK_COUNT}`);
    }

    // low degree evaluation spot checks
    const friSpotCheckCount = (options ? options.friSpotCheckCount : undefined) || DEFAULT_FRI_SPOT_CHECKS;
    if (friSpotCheckCount < 1 || friSpotCheckCount > MAX_FRI_SPOT_CHECK_COUNT || !Number.isInteger(friSpotCheckCount)) {
        throw new TypeError(`FRI sample size must be an integer between 1 and ${MAX_FRI_SPOT_CHECK_COUNT}`);
    }

    // hash function
    const hashAlgorithm = (options ? options.hashAlgorithm : undefined) || 'sha256';
    if (!HASH_ALGORITHMS.includes(hashAlgorithm)) {
        throw new TypeError(`Hash algorithm ${hashAlgorithm} is not supported`);
    }

    return { extensionFactor, exeSpotCheckCount, friSpotCheckCount, hashAlgorithm };
}

function buildReadonlyRegisters(specs: ReadonlyRegisterSpecs[] | undefined, context: EvaluationContext, domain?: bigint[]) {
    const registers = new Array<ComputedRegister>(specs ? specs.length : 0);
    for (let i = 0; i < registers.length; i++) {
        let c = specs![i];
        if (c.pattern === 'repeat') {
            registers[i] = new RepeatedConstants(c.values, context, domain !== undefined);
        }
        else if (c.pattern === 'spread') {
            registers[i] = new SpreadConstants(c.values, context, domain);
        }
        else {
            throw new TypeError(`Invalid constant pattern '${c.pattern}'`);
        }
    }
    return registers;
}

function normalizeInputs(inputs: bigint[] | bigint[][], registerCount: number): bigint[][] {
    if (!Array.isArray(inputs)) throw new TypeError(`Inputs parameter must be an array`);

    if (typeof inputs[0] === 'bigint') {
        validateInputRow(inputs as bigint[], registerCount, 0);
        inputs = [inputs as bigint[]];
    }
    else {
        for (let i = 0; i < inputs.length; i++) {
            validateInputRow(inputs[i] as bigint[], registerCount, i);
        }
    }

    return inputs as bigint[][];
}

function validateInputRow(row: bigint[], registerCount: number, rowNumber: number) {
    if (!Array.isArray(row)) {
        throw new TypeError(`Input row ${rowNumber} is not an array`);
    }

    if (row.length !== registerCount) {
        throw new TypeError(`Input row must have exactly ${registerCount} elements`);
    }

    for (let i = 0; i < registerCount; i++) {
        if (typeof row[i] !== 'bigint') {
            throw new TypeError(`Input ${rowNumber} for register $r${i} is not a BigInt`)
        };
    }
}