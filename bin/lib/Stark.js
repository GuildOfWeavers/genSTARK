"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const components_1 = require("./components");
const utils_1 = require("./utils");
const registers_1 = require("./registers");
const frames_1 = require("./frames");
const merkle_1 = require("@guildofweavers/merkle");
const Serializer_1 = require("./Serializer");
const StarkError_1 = require("./StarkError");
// MODULE VARIABLES
// ================================================================================================
const MAX_DOMAIN_SIZE = 2 ** 32;
const MAX_REGISTER_COUNT = 64;
const MAX_CONSTANT_COUNT = 64;
const MAX_CONSTRAINT_COUNT = 1024;
const MAX_CONSTRAINT_DEGREE = 12;
const MAX_EXTENSION_FACTOR = 32;
const MAX_EXE_SPOT_CHECK_COUNT = 128;
const MAX_FRI_SPOT_CHECK_COUNT = 64;
const DEFAULT_EXTENSION_FACTOR = 8;
const DEFAULT_EXE_SPOT_CHECK_COUNT = 80;
const DEFAULT_FRI_SPOT_CHECK_COUNT = 40;
// CLASS DEFINITION
// ================================================================================================
class Stark {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(config) {
        const vConfig = validateConfig(config);
        this.field = vConfig.field;
        this.registerCount = vConfig.registerCount;
        this.constantCount = vConfig.constantCount;
        this.tFunction = vConfig.tFunction;
        this.tConstraints = vConfig.tConstraints;
        this.tConstraintDegree = vConfig.tConstraintDegree;
        this.exeSpotCheckCount = vConfig.exeSpotCheckCount;
        this.friSpotCheckCount = vConfig.friSpotCheckCount;
        this.extensionFactor = vConfig.extensionFactor;
        this.hashAlgorithm = vConfig.hashAlgorithm;
        this.logger = vConfig.logger;
    }
    // PROVER
    // --------------------------------------------------------------------------------------------
    prove(assertions, steps, inputs, constants) {
        const label = this.logger.start('Starting STARK computation');
        const evaluationDomainSize = steps * this.extensionFactor;
        const constraintCount = this.tConstraints.length;
        // 0 ----- validate parameters
        if (assertions.length < 1)
            throw new TypeError('At least one assertion must be provided');
        if (!utils_1.isPowerOf2(steps))
            throw new TypeError('Number of steps must be a power of 2');
        const maxSteps = MAX_DOMAIN_SIZE / this.extensionFactor;
        if (steps > maxSteps)
            throw new TypeError(`Number of steps cannot exceed ${maxSteps}`);
        if (!Array.isArray(inputs))
            throw new TypeError(`Inputs parameter must be an array`);
        if (inputs.length !== this.registerCount)
            throw new TypeError(`Inputs array must have exactly ${this.registerCount} elements`);
        if (this.constantCount > 0) {
            if (!constants)
                throw new TypeError(`Constants array must be provided`);
            if (!Array.isArray(constants))
                throw new TypeError(`Constants parameter must be an array`);
            if (constants.length > this.constantCount)
                throw new TypeError(`Constants array must have exactly ${this.constantCount} elements`);
        }
        else {
            if (constants)
                throw new TypeError('Constants parameter was not expected');
        }
        // 1 ----- set up evaluation context
        const G2 = this.field.getRootOfUnity(evaluationDomainSize);
        const G1 = this.field.exp(G2, BigInt(this.extensionFactor));
        const context = {
            field: this.field,
            steps: steps,
            extensionFactor: this.extensionFactor,
            rootOfUnity: G2,
            registerCount: this.registerCount,
            constantCount: this.constantCount,
            hashAlgorithm: this.hashAlgorithm
        };
        const executionDomain = this.field.getPowerCycle(G1);
        const evaluationDomain = this.field.getPowerCycle(G2);
        const bPoly = new components_1.BoundaryConstraints(assertions, context);
        const zPoly = new components_1.ZeroPolynomial(context);
        const cRegisters = buildReadonlyRegisters(constants, context, evaluationDomain);
        this.logger.log(label, 'Set up evaluation context');
        // 2 ----- generate execution trace
        // first, copy over inputs to the beginning of the execution trace
        const executionTrace = new Array(this.registerCount);
        for (let register = 0; register < this.registerCount; register++) {
            executionTrace[register] = new Array(executionDomain.length);
            executionTrace[register][0] = inputs[register];
        }
        // then, apply transition function for each subsequent step
        let exeStep;
        const executionFrame = new frames_1.ProofFrame(this.field, executionTrace, cRegisters);
        try {
            for (exeStep = 0; exeStep < executionDomain.length - 1; exeStep++) {
                executionFrame.currentStep = exeStep;
                this.tFunction(executionFrame);
            }
        }
        catch (error) {
            throw new StarkError_1.StarkError(`Generation of execution trace failed at step ${exeStep}`, error);
        }
        // finally, make sure assertions don't contradict execution trace
        for (let c of assertions) {
            if (executionTrace[c.register][c.step] !== c.value) {
                throw new StarkError_1.StarkError(`Assertion at step ${c.step}, register ${c.register} conflicts with execution trace`);
            }
        }
        this.logger.log(label, 'Generated execution trace');
        // 3 ----- compute P(x) polynomials, and low-degree extend them
        const pEvaluations = new Array(this.registerCount);
        for (let register = 0; register < pEvaluations.length; register++) {
            let p = this.field.interpolateRoots(executionDomain, executionTrace[register]);
            pEvaluations[register] = this.field.evalPolyAtRoots(p, evaluationDomain);
        }
        this.logger.log(label, 'Converted execution trace into polynomials and low-degree extended them');
        // 4 ----- compute constraint polynomials Q(x) = C(P(x))
        let cIndex;
        const nonfinalSteps = evaluationDomainSize - this.extensionFactor;
        const frame = new frames_1.ProofFrame(this.field, pEvaluations, cRegisters, this.extensionFactor);
        const qEvaluations = new Array(constraintCount);
        try {
            for (cIndex = 0; cIndex < constraintCount; cIndex++) {
                let constraint = this.tConstraints[cIndex];
                qEvaluations[cIndex] = new Array(evaluationDomainSize);
                for (let step = 0; step < evaluationDomainSize; step++) {
                    frame.currentStep = step;
                    let q = constraint(frame);
                    if (step < nonfinalSteps && step % this.extensionFactor === 0 && q !== 0n) {
                        let execStep = step / this.extensionFactor;
                        throw new StarkError_1.StarkError(`The constraint didn't evaluate to 0 at step ${execStep}`);
                    }
                    qEvaluations[cIndex][step] = q;
                }
            }
        }
        catch (error) {
            throw new StarkError_1.StarkError(`Error in constraint ${cIndex}`, error);
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
        const hash = merkle_1.getHashFunction(this.hashAlgorithm);
        const serializer = new Serializer_1.Serializer(this.field, this.registerCount, constraintCount);
        const mergedEvaluations = new Array(evaluationDomainSize);
        const hashedEvaluations = new Array(evaluationDomainSize);
        for (let i = 0; i < evaluationDomainSize; i++) {
            let v = serializer.mergeEvaluations([pEvaluations, bEvaluations, dEvaluations], bPoly.count, i);
            mergedEvaluations[i] = v;
            hashedEvaluations[i] = hash(v);
        }
        this.logger.log(label, 'Serialized evaluations of P(x), B(x), and D(x) polynomials');
        const eTree = merkle_1.MerkleTree.create(hashedEvaluations, this.hashAlgorithm);
        this.logger.log(label, 'Built evaluation merkle tree');
        // 9 ----- spot check evaluation tree at pseudo-random positions
        const positions = utils_1.getPseudorandomIndexes(eTree.root, this.exeSpotCheckCount, evaluationDomainSize, this.extensionFactor);
        const augmentedPositions = this.getAugmentedPositions(positions, evaluationDomainSize);
        const eValues = new Array(augmentedPositions.length);
        for (let i = 0; i < augmentedPositions.length; i++) {
            eValues[i] = mergedEvaluations[augmentedPositions[i]];
        }
        const eProof = eTree.proveBatch(augmentedPositions);
        this.logger.log(label, `Computed ${this.exeSpotCheckCount} evaluation spot checks`);
        // 10 ---- compute random linear combination of evaluations
        // first, increase the power of polynomials to match the power of liner combination
        const lCombinationDegree = this.getLinearCombinationDegree(evaluationDomainSize);
        let allEvaluations;
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
        const hashDigestSize = merkle_1.getHashDigestSize(this.hashAlgorithm);
        const lEvaluations2 = utils_1.bigIntsToBuffers(lEvaluations, hashDigestSize);
        const lTree = merkle_1.MerkleTree.create(lEvaluations2, this.hashAlgorithm);
        const lcProof = lTree.proveBatch(positions);
        let ldProof;
        try {
            const ldProver = new components_1.LowDegreeProver(this.friSpotCheckCount, context);
            ldProof = ldProver.prove(lTree, lEvaluations, evaluationDomain, lCombinationDegree);
        }
        catch (error) {
            throw new StarkError_1.StarkError('Low degree proof failed', error);
        }
        this.logger.log(label, 'Computed low-degree proof');
        this.logger.done(label, 'STARK computed');
        // build and return the proof object
        return {
            evaluations: {
                root: eTree.root,
                values: eValues,
                nodes: eProof.nodes,
                depth: eProof.depth,
                bpc: bPoly.count
            },
            degree: {
                root: lTree.root,
                lcProof: lcProof,
                ldProof: ldProof
            }
        };
    }
    // VERIFIER
    // --------------------------------------------------------------------------------------------
    verify(assertions, proof, steps, constants) {
        const label = this.logger.start('Starting STARK verification');
        const evaluationDomainSize = steps * this.extensionFactor;
        const constraintCount = this.tConstraints.length;
        const eRoot = proof.evaluations.root;
        // 0 ----- validate parameters
        if (assertions.length < 1)
            throw new TypeError('At least one assertion must be provided');
        if (!utils_1.isPowerOf2(steps))
            throw new TypeError('Number of steps must be a power of 2');
        const maxSteps = MAX_DOMAIN_SIZE / this.extensionFactor;
        if (steps > maxSteps)
            throw new TypeError(`Number of steps cannot exceed ${maxSteps}`);
        if (this.constantCount > 0) {
            if (!constants)
                throw new TypeError(`Constants array must be provided`);
            if (!Array.isArray(constants))
                throw new TypeError(`Constants parameter must be an array`);
            if (constants.length > this.constantCount)
                throw new TypeError(`Constants array must have exactly ${this.constantCount} elements`);
        }
        else {
            if (constants)
                throw new TypeError('Constants parameter was not expected');
        }
        // 1 ----- set up evaluation context
        const G2 = this.field.getRootOfUnity(evaluationDomainSize);
        const context = {
            field: this.field,
            steps: steps,
            extensionFactor: this.extensionFactor,
            rootOfUnity: G2,
            registerCount: this.registerCount,
            constantCount: this.constantCount,
            hashAlgorithm: this.hashAlgorithm
        };
        const bPoly = new components_1.BoundaryConstraints(assertions, context);
        const zPoly = new components_1.ZeroPolynomial(context);
        const cRegisters = buildReadonlyRegisters(constants, context);
        this.logger.log(label, 'Set up evaluation context');
        // 2 ----- compute positions for evaluation spot-checks
        const positions = utils_1.getPseudorandomIndexes(eRoot, this.exeSpotCheckCount, evaluationDomainSize, this.extensionFactor);
        const augmentedPositions = this.getAugmentedPositions(positions, evaluationDomainSize);
        this.logger.log(label, `Computed positions for evaluation spot checks`);
        // 3 ----- decode evaluation spot-checks
        const pEvaluations = new Map();
        const bEvaluations = new Map();
        const dEvaluations = new Map();
        const hashedEvaluations = new Array(augmentedPositions.length);
        const hash = merkle_1.getHashFunction(this.hashAlgorithm);
        const serializer = new Serializer_1.Serializer(this.field, this.registerCount, constraintCount);
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
        const eProof = {
            values: hashedEvaluations,
            nodes: proof.evaluations.nodes,
            depth: proof.evaluations.depth
        };
        if (!merkle_1.MerkleTree.verifyBatch(eRoot, augmentedPositions, eProof, this.hashAlgorithm)) {
            throw new StarkError_1.StarkError(`Verification of evaluation Merkle proof failed`);
        }
        this.logger.log(label, `Verified evaluation merkle proof`);
        // 5 ----- verify linear combination proof
        if (!merkle_1.MerkleTree.verifyBatch(proof.degree.root, positions, proof.degree.lcProof, this.hashAlgorithm)) {
            throw new StarkError_1.StarkError(`Verification of linear combination Merkle proof failed`);
        }
        const lEvaluations = new Map();
        const lEvaluationValues = utils_1.buffersToBigInts(proof.degree.lcProof.values);
        for (let i = 0; i < proof.degree.lcProof.values.length; i++) {
            let position = positions[i];
            lEvaluations.set(position, lEvaluationValues[i]);
        }
        this.logger.log(label, `Verified liner combination proof`);
        // 6 ----- verify low-degree proof
        const lCombinationDegree = this.getLinearCombinationDegree(evaluationDomainSize);
        try {
            const ldProver = new components_1.LowDegreeProver(this.friSpotCheckCount, context);
            ldProver.verify(proof.degree.root, lCombinationDegree, G2, proof.degree.ldProof);
        }
        catch (error) {
            throw new StarkError_1.StarkError('Verification of low degree failed', error);
        }
        const lPolyCount = constraintCount + 2 * (this.registerCount + bPoly.count);
        const lCoefficients = this.field.prng(eRoot, lPolyCount);
        this.logger.log(label, `Verified low-degree proof`);
        // 7 ----- verify transition and boundary constraints
        const pFrame = new frames_1.VerificationFrame(this.field, evaluationDomainSize, pEvaluations, cRegisters, this.extensionFactor);
        for (let i = 0; i < positions.length; i++) {
            let step = positions[i];
            let x = this.field.exp(G2, BigInt(step));
            pFrame.currentStep = step;
            pFrame.currentX = x;
            let pValues = pEvaluations.get(step);
            let bValues = bEvaluations.get(step);
            let dValues = dEvaluations.get(step);
            let zValue = zPoly.evaluateAt(x);
            // check transition constraints
            for (let j = 0; j < constraintCount; j++) {
                let qValue = this.tConstraints[j](pFrame);
                let qCheck = this.field.mul(zValue, dValues[j]);
                if (qValue !== qCheck) {
                    throw new StarkError_1.StarkError(`Transition constraint at position ${step} was not satisfied`);
                }
            }
            // check boundary constraints
            let bChecks = bPoly.evaluateAt(pEvaluations.get(step), x);
            for (let j = 0; j < bChecks.length; j++) {
                if (bChecks[j] !== bValues[j]) {
                    throw new StarkError_1.StarkError(`Boundary constraint at position ${step} was not satisfied`);
                }
            }
            // check correctness of liner 
            let lcValues;
            if (lCombinationDegree > steps) {
                let power = this.field.exp(x, BigInt(lCombinationDegree - steps));
                let pbValues = [...pValues, ...bValues];
                let pbValues2 = new Array(pbValues.length);
                for (let j = 0; j < pbValues2.length; j++) {
                    pbValues2[j] = pbValues[j] * power;
                }
                lcValues = [...pbValues2, ...pbValues, ...dValues];
            }
            else {
                let power = this.field.exp(x, BigInt(steps - 1));
                let dValues2 = new Array(dValues.length);
                for (let j = 0; j < dValues2.length; j++) {
                    dValues2[j] = dValues[j] * power;
                }
                lcValues = [...pValues, ...bValues, ...dValues2];
            }
            let lCheck = this.field.combine(lcValues, lCoefficients);
            if (lEvaluations.get(step) !== lCheck) {
                throw new StarkError_1.StarkError(`Linear combination at position ${step} is inconsistent`);
            }
        }
        this.logger.log(label, `Verified transition and boundary constraints`);
        this.logger.done(label, 'STARK verified');
        return true;
    }
    // UTILITIES
    // --------------------------------------------------------------------------------------------
    sizeOf(proof) {
        const valueCount = this.registerCount + this.tConstraints.length + proof.evaluations.bpc;
        const valueSize = valueCount * this.field.elementSize;
        const size = utils_1.sizeOf(proof, valueSize, this.hashAlgorithm);
        return size.total;
    }
    serialize(proof) {
        const serializer = new Serializer_1.Serializer(this.field, this.registerCount, this.tConstraints.length);
        return serializer.serializeProof(proof, this.hashAlgorithm);
    }
    parse(buffer) {
        const serializer = new Serializer_1.Serializer(this.field, this.registerCount, this.tConstraints.length);
        return serializer.parseProof(buffer, this.hashAlgorithm);
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
    getLinearCombinationDegree(evaluationDomainSize) {
        const steps = evaluationDomainSize / this.extensionFactor;
        // the logic is as follows:
        // deg(Q(x)) = steps * deg(constraints) = deg(D(x)) + deg(Z(x))
        // thus, deg(D(x)) = deg(Q(x)) - steps;
        // and, linear combination degree is max(deg(D(x)), steps)
        const degree = steps * Math.max(this.tConstraintDegree - 1, 1);
        return degree;
    }
}
exports.Stark = Stark;
// HELPER FUNCTIONS
// ================================================================================================
function validateConfig(config) {
    if (!config)
        throw new TypeError('STARK config was not provided');
    if (!config.field)
        throw new TypeError('Finite field was not provided');
    const registerCount = config.registerCount;
    if (registerCount < 1 || registerCount > MAX_REGISTER_COUNT || !Number.isInteger(registerCount)) {
        throw new TypeError(`Number of state registers must be an integer between 1 and ${MAX_REGISTER_COUNT}`);
    }
    const constantCount = config.constantCount || 0;
    if (constantCount < 0 || constantCount > MAX_CONSTANT_COUNT || !Number.isInteger(constantCount)) {
        throw new TypeError(`Number of state constants must be an integer between 0 and ${MAX_CONSTANT_COUNT}`);
    }
    if (!config.tFunction)
        throw new TypeError('Transition function was not provided');
    if (!config.tConstraints)
        throw new TypeError('Transition constraints array was not provided');
    if (Array.isArray(!config.tConstraints)) {
        throw new TypeError('Transition constraints must be provided as an array');
    }
    if (config.tConstraints.length === 0)
        throw new TypeError('Transition constraints array was empty');
    if (config.tConstraints.length > MAX_CONSTRAINT_COUNT) {
        throw new TypeError(`Number of transition constraints cannot exceed ${MAX_CONSTRAINT_COUNT}`);
    }
    const tConstraintDegree = config.tConstraintDegree;
    if (tConstraintDegree < 1 || tConstraintDegree > MAX_CONSTRAINT_DEGREE || !Number.isInteger(tConstraintDegree)) {
        throw new TypeError(`Transition constraint degree must be an integer between 1 and ${MAX_CONSTRAINT_DEGREE}`);
    }
    const extensionFactor = config.extensionFactor || DEFAULT_EXTENSION_FACTOR;
    if (extensionFactor < 2 || extensionFactor > MAX_EXTENSION_FACTOR || !Number.isInteger(extensionFactor)) {
        throw new TypeError(`Extension factor must be an integer between 2 and ${MAX_EXTENSION_FACTOR}`);
    }
    if (extensionFactor < 2 * tConstraintDegree) {
        throw new TypeError(`Extension factor must be at least 2x greater than the maximum transition constraint degree.`);
    }
    const exeSpotCheckCount = config.exeSpotCheckCount || DEFAULT_EXE_SPOT_CHECK_COUNT;
    if (exeSpotCheckCount < 1 || exeSpotCheckCount > MAX_EXE_SPOT_CHECK_COUNT || !Number.isInteger(exeSpotCheckCount)) {
        throw new TypeError(`Execution sample size must be an integer between 1 and ${MAX_EXE_SPOT_CHECK_COUNT}`);
    }
    const friSpotCheckCount = config.friSpotCheckCount || DEFAULT_FRI_SPOT_CHECK_COUNT;
    if (friSpotCheckCount < 1 || friSpotCheckCount > MAX_FRI_SPOT_CHECK_COUNT || !Number.isInteger(friSpotCheckCount)) {
        throw new TypeError(`FRI sample size must be an integer between 1 and ${MAX_FRI_SPOT_CHECK_COUNT}`);
    }
    const hashAlgorithm = config.hashAlgorithm || 'sha256';
    const logger = config.logger || new utils_1.Logger();
    return {
        field: config.field,
        registerCount: registerCount,
        constantCount: constantCount,
        tFunction: config.tFunction,
        tConstraints: config.tConstraints,
        tConstraintDegree: tConstraintDegree,
        extensionFactor: extensionFactor,
        exeSpotCheckCount: exeSpotCheckCount,
        friSpotCheckCount: friSpotCheckCount,
        hashAlgorithm: hashAlgorithm,
        logger: logger
    };
}
function buildReadonlyRegisters(constants, context, domain) {
    const registers = new Array(constants ? constants.length : 0);
    for (let i = 0; i < registers.length; i++) {
        let c = constants[i];
        if (c.pattern === 1 /* repeat */) {
            registers[i] = new registers_1.RepeatedConstants(c.values, context, domain !== undefined);
        }
        else if (c.pattern === 2 /* stretch */) {
            registers[i] = new registers_1.StretchedConstants(c.values, context, domain);
        }
    }
    return registers;
}
//# sourceMappingURL=Stark.js.map