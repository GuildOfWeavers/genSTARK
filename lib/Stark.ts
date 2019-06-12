// IMPORTS
// ================================================================================================
import {
    StarkConfig, FiniteField, Assertion, TransitionFunction, ConstraintEvaluator, BatchConstraintEvaluator, 
    HashAlgorithm, StarkProof, BatchMerkleProof, EvaluationContext, ReadonlyRegister, Constant, Logger as ILogger
} from '@guildofweavers/genstark';
import { ZeroPolynomial, BoundaryConstraints, LowDegreeProver } from './components';
import { Logger, isPowerOf2, getPseudorandomIndexes, sizeOf, bigIntsToBuffers, buffersToBigInts } from './utils';
import { RepeatedConstants, SpreadConstants } from './registers';
import { MerkleTree, getHashFunction, getHashDigestSize } from '@guildofweavers/merkle';
import { parseStarkConfig, MAX_DOMAIN_SIZE } from './config';
import { Serializer } from './Serializer';
import { StarkError } from './StarkError';

// CLASS DEFINITION
// ================================================================================================
export class Stark {

    readonly field              : FiniteField;
    readonly iterationLength    : number;
    readonly registerCount      : number;
    readonly constraintCount    : number;
    readonly maxConstraintDegree: number;
    readonly constants          : Constant[];

    readonly extensionFactor    : number;
    readonly exeSpotCheckCount  : number;
    readonly friSpotCheckCount  : number;

    readonly applyTransitions   : TransitionFunction;
    readonly applyConstraints   : BatchConstraintEvaluator;
    readonly evaluateConstraints: ConstraintEvaluator;

    readonly hashAlgorithm      : HashAlgorithm;
    readonly logger             : ILogger;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(config: StarkConfig, logger?: ILogger) {
        const vConfig = parseStarkConfig(config);

        this.field = vConfig.field;
        this.iterationLength = vConfig.iterationLength;
        this.registerCount = vConfig.registerCount;
        this.constraintCount = vConfig.constraintCount;
        this.maxConstraintDegree = vConfig.tConstraints.maxDegree;
        this.constants = vConfig.constants;

        this.extensionFactor = vConfig.extensionFactor;
        this.exeSpotCheckCount = vConfig.exeSpotCheckCount;
        this.friSpotCheckCount = vConfig.friSpotCheckCount;

        this.applyTransitions = vConfig.tFunction;
        this.applyConstraints = vConfig.tConstraints.batchEvaluator;
        this.evaluateConstraints = vConfig.tConstraints.evaluator;

        this.hashAlgorithm = vConfig.hashAlgorithm;
        this.logger = logger || new Logger();
    }

    // PROVER
    // --------------------------------------------------------------------------------------------
    prove(assertions: Assertion[], inputs: bigint[]): StarkProof {

        const label = this.logger.start('Starting STARK computation');
        const steps = this.iterationLength; // TODO: make dependent on inputs
        const evaluationDomainSize = steps * this.extensionFactor;
        const constantCount = this.constants.length;

        // 0 ----- validate parameters
        if (assertions.length < 1) throw new TypeError('At least one assertion must be provided');
        // TODO: if (!isPowerOf2(iterations)) throw new TypeError('Number of iterations must be a power of 2');
        const maxSteps = MAX_DOMAIN_SIZE / this.extensionFactor;
        if (steps > maxSteps) throw new TypeError(`Total number of steps cannot exceed ${maxSteps}`);
        if (!Array.isArray(inputs)) throw new TypeError(`Inputs parameter must be an array`);
        if (inputs.length !== this.registerCount) throw new TypeError(`Inputs array must have exactly ${this.registerCount} elements`);
        for (let i = 0; i < inputs.length; i++) {
            if (typeof inputs[i] !== 'bigint') throw new TypeError(`Input for register r${i} is not a BigInt`);
        }

        // 1 ----- set up evaluation context
        const G2 = this.field.getRootOfUnity(evaluationDomainSize);
        const G1 = this.field.exp(G2, BigInt(this.extensionFactor));

        const context: EvaluationContext = {
            field           : this.field,
            steps           : steps,
            extensionFactor : this.extensionFactor,
            rootOfUnity     : G2,
            registerCount   : this.registerCount,
            constantCount   : constantCount,
            hashAlgorithm   : this.hashAlgorithm
        };

        const executionDomain = this.field.getPowerCycle(G1);
        const evaluationDomain = this.field.getPowerCycle(G2);

        const bPoly = new BoundaryConstraints(assertions, context);
        const zPoly = new ZeroPolynomial(context);
        const cRegisters = buildReadonlyRegisters(this.constants, context, evaluationDomain);
        this.logger.log(label, 'Set up evaluation context');

        // 2 ----- generate execution trace
        // first, copy over inputs to the beginning of the execution trace
        const executionTrace = new Array<bigint[]>(this.registerCount);
        for (let register = 0; register < this.registerCount; register++) {
            executionTrace[register] = new Array(executionDomain.length);
            executionTrace[register][0] = inputs[register];
        }

        // then, apply transition function for all steps
        try {
            this.applyTransitions(executionTrace, cRegisters, steps, this.field);
        }
        catch (error) {
            throw new StarkError('Failed to generate execution trace', error);
        }

        // finally, make sure assertions don't contradict execution trace
        for (let c of assertions) {
            if (executionTrace[c.register][c.step] !== c.value) {
                throw new StarkError(`Assertion at step ${c.step}, register ${c.register} conflicts with execution trace`);
            }
        }
        this.logger.log(label, 'Generated execution trace');

        // 3 ----- compute P(x) polynomials, and low-degree extend them
        const pEvaluations = new Array<bigint[]>(this.registerCount);
        for (let register = 0; register < pEvaluations.length; register++) {
            let p = this.field.interpolateRoots(executionDomain, executionTrace[register]);
            pEvaluations[register] = this.field.evalPolyAtRoots(p, evaluationDomain);
        }
        this.logger.log(label, 'Converted execution trace into polynomials and low-degree extended them');

        // 4 ----- compute constraint polynomials Q(x) = C(P(x))
        const qEvaluations = new Array<bigint[]>(this.constraintCount);
        for (let i = 0; i < this.constraintCount; i++) {
            qEvaluations[i] = new Array<bigint>(evaluationDomainSize);
        }
        try {
            this.applyConstraints(qEvaluations, pEvaluations, cRegisters, evaluationDomainSize, this.extensionFactor, this.field);
        }
        catch (error) {
            throw new StarkError('Failed to evaluate transition constraints', error);
        }
        this.logger.log(label, 'Computed Q(x) polynomials');

        // 5 ----- compute polynomial Z(x) separately as numerator and denominator
        const zEvaluations = zPoly.evaluateAll(evaluationDomain);
        this.logger.log(label, 'Computed Z(x) polynomial');

        // 6 ----- compute D(x) = Q(x) / Z(x)
        // first, invert numerators of Z(x)
        const zNumInverses = this.field.invMany(zEvaluations.numerators);
        this.logger.log(label, 'Inverted Z(x) numerators');

        // then, compute multiply all values together to compute D(x)
        const zDenominators = zEvaluations.denominators;
        const dEvaluations = this.field.mulMany(qEvaluations, zDenominators, zNumInverses);
        this.logger.log(label, 'Computed D(x) polynomials');

        // 7 ----- compute boundary constraints B(x)
        const bEvaluations = bPoly.evaluateAll(pEvaluations, evaluationDomain);
        this.logger.log(label, 'Computed B(x) polynomials');

        // 8 ----- build merkle tree for evaluations of P(x), D(x), and B(x)
        const hash = getHashFunction(this.hashAlgorithm);
        const serializer = new Serializer(this.field, this.registerCount, this.constraintCount);
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
        // first, increase the power of polynomials to match the power of liner combination
        const lCombinationDegree = this.getLinearCombinationDegree(evaluationDomainSize);
        let allEvaluations: bigint[][];
        if (lCombinationDegree > steps) {
            // increase degrees of P(x) and B(x) polynomials
            const pbIncrementalDegree = BigInt(lCombinationDegree - steps);
            const pbPowerSeed = this.field.exp(G2, pbIncrementalDegree);
            const powers = this.field.getPowerSeries(pbPowerSeed, evaluationDomainSize);
            const pbEvaluations = [...pEvaluations, ...bEvaluations];
            const pbEvaluations2 = this.field.mulMany(pbEvaluations, powers);
            allEvaluations = [...pbEvaluations2, ...pbEvaluations, ...dEvaluations];
        }
        else {
            // increase degree of D(x) polynomial
            const dPowerSeed = this.field.exp(G2, BigInt(steps - 1));
            const powers = this.field.getPowerSeries(dPowerSeed, evaluationDomainSize);
            const dEvaluations2 = this.field.mulMany(dEvaluations, powers);
            allEvaluations = [...pEvaluations, ...bEvaluations, ...dEvaluations2];
        }

        // then compute a linear combination of all polynomials
        const lCoefficients = this.field.prng(eTree.root, allEvaluations.length);
        const lEvaluations = this.field.combineMany(allEvaluations, lCoefficients);
        this.logger.log(label, 'Computed random linear combination of evaluations');

        // 11 ----- Compute low-degree proof
        const hashDigestSize = getHashDigestSize(this.hashAlgorithm);
        const lEvaluations2 = bigIntsToBuffers(lEvaluations, hashDigestSize)
        const lTree = MerkleTree.create(lEvaluations2, this.hashAlgorithm);
        const lcProof = lTree.proveBatch(positions);
        let ldProof;
        try {
            const ldProver = new LowDegreeProver(this.friSpotCheckCount, context);
            ldProof = ldProver.prove(lTree, lEvaluations, evaluationDomain, lCombinationDegree);
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
        const steps = this.iterationLength * iterations;
        const evaluationDomainSize = steps * this.extensionFactor;
        const constantCount = this.constants.length;
        const eRoot = proof.evaluations.root;

        // 0 ----- validate parameters
        if (assertions.length < 1) throw new TypeError('At least one assertion must be provided');
        if (!isPowerOf2(iterations)) throw new TypeError('Number of iterations must be a power of 2');
        const maxSteps = MAX_DOMAIN_SIZE / this.extensionFactor;
        if (steps > maxSteps) throw new TypeError(`Total number of steps cannot exceed ${maxSteps}`);

        // 1 ----- set up evaluation context
        const G2 = this.field.getRootOfUnity(evaluationDomainSize);

        const context: EvaluationContext = {
            field           : this.field,
            steps           : steps,
            extensionFactor : this.extensionFactor,
            rootOfUnity     : G2,
            registerCount   : this.registerCount,
            constantCount   : constantCount,
            hashAlgorithm   : this.hashAlgorithm
        };

        const bPoly = new BoundaryConstraints(assertions, context);
        const zPoly = new ZeroPolynomial(context);
        const cRegisters = buildReadonlyRegisters(this.constants, context);
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
        const serializer = new Serializer(this.field, this.registerCount, this.constraintCount);

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

        const lEvaluations = new Map<number, bigint>();
        const lEvaluationValues = buffersToBigInts(proof.degree.lcProof.values);
        for (let i = 0; i < proof.degree.lcProof.values.length; i++) {
            let position = positions[i];
            lEvaluations.set(position, lEvaluationValues[i]);
        }
        this.logger.log(label, `Verified liner combination proof`);

        // 6 ----- verify low-degree proof
        const lCombinationDegree = this.getLinearCombinationDegree(evaluationDomainSize);
        try {
            const ldProver = new LowDegreeProver(this.friSpotCheckCount, context);
            ldProver.verify(proof.degree.root, lCombinationDegree, G2, proof.degree.ldProof);
        }
        catch (error) {
            throw new StarkError('Verification of low degree failed', error);
        }

        const lPolyCount = this.constraintCount + 2 * (this.registerCount + bPoly.count);
        const lCoefficients = this.field.prng(eRoot, lPolyCount);
        this.logger.log(label, `Verified low-degree proof`);

        // 7 ----- verify transition and boundary constraints
        for (let i = 0; i < positions.length; i++) {
            let step = positions[i];
            let x = this.field.exp(G2, BigInt(step));

            let pValues = pEvaluations.get(step)!;
            let bValues = bEvaluations.get(step)!;
            let dValues = dEvaluations.get(step)!;
            let zValue = zPoly.evaluateAt(x);

            // build an array of constant values for the current step
            let cValues = new Array<bigint>(constantCount);
            for (let j = 0; j < constantCount; j++) {
                cValues[j] = cRegisters[j].getValueAt(x);
            }

            // check transition 
            let npValues = pEvaluations.get((step + this.extensionFactor) % evaluationDomainSize)!;
            let qValues = this.evaluateConstraints(pValues, npValues, cValues, this.field);
            for (let j = 0; j < this.constraintCount; j++) {
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
            let lcValues: bigint[];
            if (lCombinationDegree > steps) {
                let power = this.field.exp(x, BigInt(lCombinationDegree - steps));
                let pbValues = [...pValues, ...bValues];
                let pbValues2 = new Array<bigint>(pbValues.length);
                for (let j = 0; j < pbValues2.length; j++) {
                    pbValues2[j] = pbValues[j] * power;
                }
                lcValues = [...pbValues2, ...pbValues, ...dValues];
            }
            else {
                let power = this.field.exp(x, BigInt(steps - 1));
                let dValues2 = new Array<bigint>(dValues.length);
                for (let j = 0; j < dValues2.length; j++) {
                    dValues2[j] = dValues[j] * power;
                }
                lcValues = [...pValues, ...bValues, ...dValues2]
            }

            let lCheck = this.field.combine(lcValues, lCoefficients);
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
        const valueCount = this.registerCount + this.constraintCount + proof.evaluations.bpc; 
        const valueSize = valueCount * this.field.elementSize;
        const size = sizeOf(proof, valueSize, this.hashAlgorithm);
        return size.total;
    }

    serialize(proof: StarkProof) {
        const serializer = new Serializer(this.field, this.registerCount, this.constraintCount);
        return serializer.serializeProof(proof, this.hashAlgorithm);
    }

    parse(buffer: Buffer): StarkProof {
        const serializer = new Serializer(this.field, this.registerCount, this.constraintCount);
        return serializer.parseProof(buffer, this.hashAlgorithm);
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

    private getLinearCombinationDegree(evaluationDomainSize: number): number {
        const steps = evaluationDomainSize / this.extensionFactor;
        // the logic is as follows:
        // deg(Q(x)) = steps * deg(constraints) = deg(D(x)) + deg(Z(x))
        // thus, deg(D(x)) = deg(Q(x)) - steps;
        // and, linear combination degree is max(deg(D(x)), steps)
        const degree = steps * Math.max(this.maxConstraintDegree - 1, 1);
        return degree;
    }
}

// HELPER FUNCTIONS
// ================================================================================================
function buildReadonlyRegisters(constants: Constant[] | undefined, context: EvaluationContext, domain?: bigint[]) {
    const registers = new Array<ReadonlyRegister>(constants ? constants.length : 0);
    for (let i = 0; i < registers.length; i++) {
        let c = constants![i];
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