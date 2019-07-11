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
const MAX_DOMAIN_SIZE = 2 ** 32;
const DEFAULT_EXE_SPOT_CHECKS = 80;
const DEFAULT_FRI_SPOT_CHECKS = 40;
const MAX_EXTENSION_FACTOR = 32;
const MAX_EXE_SPOT_CHECK_COUNT = 128;
const MAX_FRI_SPOT_CHECK_COUNT = 64;
const HASH_ALGORITHMS = ['sha256', 'blake2s256'];
// CLASS DEFINITION
// ================================================================================================
class Stark {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(source, options, logger) {
        if (typeof source !== 'string')
            throw new TypeError('Source script must be a string');
        if (!source.trim())
            throw new TypeError('Source script cannot be an empty string');
        const vOptions = validateSecurityOptions(options);
        this.air = air_script_1.parseScript(source, undefined, vOptions.extensionFactor);
        this.exeQueryCount = vOptions.exeQueryCount;
        this.hashAlgorithm = vOptions.hashAlgorithm;
        this.ldProver = new components_1.LowDegreeProver(vOptions.friQueryCount, this.hashAlgorithm, this.air);
        this.serializer = new Serializer_1.Serializer(this.air);
        this.logger = logger || new utils_1.Logger();
    }
    // PROVER
    // --------------------------------------------------------------------------------------------
    prove(assertions, initValues, publicInputs, secretInputs) {
        const label = this.logger.start('Starting STARK computation');
        const extensionFactor = this.air.extensionFactor;
        // 0 ----- validate parameters
        if (!Array.isArray(assertions))
            throw new TypeError('Assertions parameter must be an array');
        if (assertions.length === 0)
            throw new TypeError('At least one assertion must be provided');
        if (!Array.isArray(initValues))
            throw new TypeError('Initialization values parameter must be an array');
        // 1 ----- set up evaluation context
        const context = this.air.createContext(publicInputs || [], secretInputs || []);
        const evaluationDomainSize = context.evaluationDomain.length;
        this.logger.log(label, 'Set up evaluation context');
        // 2 ----- generate execution trace and make sure it is correct
        let executionTrace;
        try {
            executionTrace = this.air.generateExecutionTrace(initValues, context);
        }
        catch (error) {
            throw new StarkError_1.StarkError(`Failed to generate the execution trace`, error);
        }
        validateAssertions(executionTrace, assertions);
        this.logger.log(label, 'Generated execution trace');
        // 3 ----- compute P(x) polynomials and low-degree extend them
        const pPoly = new components_1.TracePolynomial(context);
        const pEvaluations = pPoly.evaluate(executionTrace);
        this.logger.log(label, 'Converted execution trace into polynomials and low-degree extended them');
        // 4 ----- compute constraint polynomials Q(x) = C(P(x))
        let qEvaluations;
        try {
            qEvaluations = this.air.evaluateExtendedTrace(pEvaluations, context);
        }
        catch (error) {
            throw new StarkError_1.StarkError('Failed to evaluate transition constraints', error);
        }
        this.logger.log(label, 'Computed Q(x) polynomials');
        // 5 ----- compute polynomial Z(x) separately as numerator and denominator
        const zPoly = new components_1.ZeroPolynomial(context);
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
        const bPoly = new components_1.BoundaryConstraints(assertions, context);
        const bEvaluations = bPoly.evaluateAll(pEvaluations, context.evaluationDomain);
        this.logger.log(label, 'Computed B(x) polynomials');
        // 8 ----- build merkle tree for evaluations of P(x), D(x), and B(x)
        const hash = merkle_1.getHashFunction(this.hashAlgorithm);
        const mergedEvaluations = new Array(evaluationDomainSize);
        const hashedEvaluations = new Array(evaluationDomainSize);
        for (let i = 0; i < evaluationDomainSize; i++) {
            let v = this.serializer.mergeEvaluations([pEvaluations, bEvaluations, dEvaluations], bPoly.count, i);
            mergedEvaluations[i] = v;
            hashedEvaluations[i] = hash(v);
        }
        this.logger.log(label, 'Serialized evaluations of P(x), B(x), and D(x) polynomials');
        const eTree = merkle_1.MerkleTree.create(hashedEvaluations, this.hashAlgorithm);
        this.logger.log(label, 'Built evaluation merkle tree');
        // 9 ----- spot check evaluation tree at pseudo-random positions
        const queryCount = Math.min(this.exeQueryCount, evaluationDomainSize - evaluationDomainSize / extensionFactor);
        const positions = utils_1.getPseudorandomIndexes(eTree.root, queryCount, evaluationDomainSize, extensionFactor);
        const augmentedPositions = this.getAugmentedPositions(positions, evaluationDomainSize);
        const eValues = new Array(augmentedPositions.length);
        for (let i = 0; i < augmentedPositions.length; i++) {
            eValues[i] = mergedEvaluations[augmentedPositions[i]];
        }
        const eProof = eTree.proveBatch(augmentedPositions);
        this.logger.log(label, `Computed ${queryCount} evaluation spot checks`);
        // 10 ---- compute random linear combination of evaluations
        const lCombination = new components_1.LinearCombination(context, eTree.root, this.air.maxConstraintDegree);
        const lEvaluations = lCombination.computeMany(pEvaluations, bEvaluations, dEvaluations);
        ;
        this.logger.log(label, 'Computed random linear combination of evaluations');
        // 11 ----- Compute low-degree proof
        const hashDigestSize = merkle_1.getHashDigestSize(this.hashAlgorithm);
        const lEvaluations2 = utils_1.bigIntsToBuffers(lEvaluations, hashDigestSize);
        const lTree = merkle_1.MerkleTree.create(lEvaluations2, this.hashAlgorithm);
        const lcProof = lTree.proveBatch(positions);
        let ldProof;
        try {
            ldProof = this.ldProver.prove(lTree, lEvaluations, context.evaluationDomain, lCombination.degree);
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
    verify(assertions, proof, publicInputs) {
        const label = this.logger.start('Starting STARK verification');
        const eRoot = proof.evaluations.root;
        const extensionFactor = this.air.extensionFactor;
        // 0 ----- validate parameters
        if (assertions.length < 1)
            throw new TypeError('At least one assertion must be provided');
        // 1 ----- set up evaluation context
        const context = this.air.createContext(publicInputs || []);
        const evaluationDomainSize = context.traceLength * extensionFactor;
        const G2 = context.rootOfUnity;
        const bPoly = new components_1.BoundaryConstraints(assertions, context);
        const zPoly = new components_1.ZeroPolynomial(context);
        this.logger.log(label, 'Set up evaluation context');
        // 2 ----- compute positions for evaluation spot-checks
        const queryCount = Math.min(this.exeQueryCount, evaluationDomainSize - evaluationDomainSize / extensionFactor);
        const positions = utils_1.getPseudorandomIndexes(eRoot, queryCount, evaluationDomainSize, extensionFactor);
        const augmentedPositions = this.getAugmentedPositions(positions, evaluationDomainSize);
        this.logger.log(label, `Computed positions for evaluation spot checks`);
        // 3 ----- decode evaluation spot-checks
        const pEvaluations = new Map();
        const bEvaluations = new Map();
        const dEvaluations = new Map();
        const hashedEvaluations = new Array(augmentedPositions.length);
        const hash = merkle_1.getHashFunction(this.hashAlgorithm);
        for (let i = 0; i < proof.evaluations.values.length; i++) {
            let mergedEvaluations = proof.evaluations.values[i];
            let position = augmentedPositions[i];
            let [p, b, d] = this.serializer.parseEvaluations(mergedEvaluations, bPoly.count);
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
        try {
            if (!merkle_1.MerkleTree.verifyBatch(eRoot, augmentedPositions, eProof, this.hashAlgorithm)) {
                throw new StarkError_1.StarkError(`Verification of evaluation Merkle proof failed`);
            }
        }
        catch (error) {
            if (error instanceof StarkError_1.StarkError === false) {
                throw new StarkError_1.StarkError(`Verification of evaluation Merkle proof failed`, error);
            }
        }
        this.logger.log(label, `Verified evaluation merkle proof`);
        // 5 ----- verify linear combination proof
        try {
            if (!merkle_1.MerkleTree.verifyBatch(proof.degree.root, positions, proof.degree.lcProof, this.hashAlgorithm)) {
                throw new StarkError_1.StarkError(`Verification of linear combination Merkle proof failed`);
            }
        }
        catch (error) {
            if (error instanceof StarkError_1.StarkError === false) {
                throw new StarkError_1.StarkError(`Verification of linear combination Merkle proof failed`, error);
            }
        }
        const lCombination = new components_1.LinearCombination(context, proof.evaluations.root, this.air.maxConstraintDegree);
        const lEvaluations = new Map();
        const lEvaluationValues = utils_1.buffersToBigInts(proof.degree.lcProof.values);
        for (let i = 0; i < proof.degree.lcProof.values.length; i++) {
            let position = positions[i];
            lEvaluations.set(position, lEvaluationValues[i]);
        }
        this.logger.log(label, `Verified liner combination proof`);
        // 6 ----- verify low-degree proof
        try {
            this.ldProver.verify(proof.degree.root, lCombination.degree, G2, proof.degree.ldProof);
        }
        catch (error) {
            throw new StarkError_1.StarkError('Verification of low degree failed', error);
        }
        this.logger.log(label, `Verified low-degree proof`);
        // 7 ----- verify transition and boundary constraints
        for (let i = 0; i < positions.length; i++) {
            let step = positions[i];
            let x = this.air.field.exp(G2, BigInt(step));
            let pValues = pEvaluations.get(step);
            let bValues = bEvaluations.get(step);
            let dValues = dEvaluations.get(step);
            let sValues = []; // TODO: populate
            let zValue = zPoly.evaluateAt(x);
            // check transition 
            let npValues = pEvaluations.get((step + extensionFactor) % evaluationDomainSize);
            let qValues = this.air.evaluateConstraintsAt(x, pValues, npValues, sValues, context);
            for (let j = 0; j < qValues.length; j++) {
                let qCheck = this.air.field.mul(zValue, dValues[j]);
                if (qValues[j] !== qCheck) {
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
            let lCheck = lCombination.computeOne(x, pValues, bValues, dValues);
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
        // TODO: include secret input count, refactor
        const valueCount = this.air.stateWidth + this.air.constraintCount + proof.evaluations.bpc;
        const valueSize = valueCount * this.air.field.elementSize;
        const size = utils_1.sizeOf(proof, valueSize, this.hashAlgorithm);
        return size.total;
    }
    serialize(proof) {
        return this.serializer.serializeProof(proof, this.hashAlgorithm);
    }
    parse(buffer) {
        return this.serializer.parseProof(buffer, this.hashAlgorithm);
    }
    // HELPER METHODS
    // --------------------------------------------------------------------------------------------
    getAugmentedPositions(positions, evaluationDomainSize) {
        const skip = this.air.extensionFactor;
        const augmentedPositionSet = new Set();
        for (let i = 0; i < positions.length; i++) {
            augmentedPositionSet.add(positions[i]);
            augmentedPositionSet.add((positions[i] + skip) % evaluationDomainSize);
        }
        return Array.from(augmentedPositionSet);
    }
}
exports.Stark = Stark;
// HELPER FUNCTIONS
// ================================================================================================
function validateSecurityOptions(options) {
    // execution trace spot checks
    const exeSpotCheckCount = (options ? options.exeQueryCount : undefined) || DEFAULT_EXE_SPOT_CHECKS;
    if (exeSpotCheckCount < 1 || exeSpotCheckCount > MAX_EXE_SPOT_CHECK_COUNT || !Number.isInteger(exeSpotCheckCount)) {
        throw new TypeError(`Execution sample size must be an integer between 1 and ${MAX_EXE_SPOT_CHECK_COUNT}`);
    }
    // low degree evaluation spot checks
    const friSpotCheckCount = (options ? options.friQueryCount : undefined) || DEFAULT_FRI_SPOT_CHECKS;
    if (friSpotCheckCount < 1 || friSpotCheckCount > MAX_FRI_SPOT_CHECK_COUNT || !Number.isInteger(friSpotCheckCount)) {
        throw new TypeError(`FRI sample size must be an integer between 1 and ${MAX_FRI_SPOT_CHECK_COUNT}`);
    }
    // hash function
    const hashAlgorithm = (options ? options.hashAlgorithm : undefined) || 'sha256';
    if (!HASH_ALGORITHMS.includes(hashAlgorithm)) {
        throw new TypeError(`Hash algorithm ${hashAlgorithm} is not supported`);
    }
    const extensionFactor = (options ? options.extensionFactor : undefined);
    return { extensionFactor, exeQueryCount: exeSpotCheckCount, friQueryCount: friSpotCheckCount, hashAlgorithm };
}
function normalizeInputs(inputs, registerCount) {
    if (!Array.isArray(inputs))
        throw new TypeError(`Inputs parameter must be an array`);
    if (typeof inputs[0] === 'bigint') {
        validateInputRow(inputs, registerCount, 0);
        inputs = [inputs];
    }
    else {
        for (let i = 0; i < inputs.length; i++) {
            validateInputRow(inputs[i], registerCount, i);
        }
    }
    return inputs;
}
function validateInputRow(row, registerCount, rowNumber) {
    if (!Array.isArray(row)) {
        throw new TypeError(`Input row ${rowNumber} is not an array`);
    }
    if (row.length !== registerCount) {
        throw new TypeError(`Input row must have exactly ${registerCount} elements`);
    }
    for (let i = 0; i < registerCount; i++) {
        if (typeof row[i] !== 'bigint') {
            throw new TypeError(`Input ${rowNumber} for register $r${i} is not a BigInt`);
        }
        ;
    }
}
function validateAssertions(trace, assertions) {
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
            throw new StarkError_1.StarkError(`Assertion at step ${a.step}, register ${a.register} conflicts with execution trace`);
        }
    }
}
//# sourceMappingURL=Stark.js.map