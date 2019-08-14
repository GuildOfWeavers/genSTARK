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
const HASH_ALGORITHMS = ['sha256', 'blake2s256', 'wasmBlake2s256'];
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
        const vOptions = validateSecurityOptions(security);
        this.air = air_script_1.parseScript(source, undefined, { extensionFactor: vOptions.extensionFactor, wasmOptions: optimization });
        this.indexGenerator = new components_1.QueryIndexGenerator(this.air.extensionFactor, vOptions);
        this.hashAlgorithm = vOptions.hashAlgorithm;
        this.ldProver = new components_1.LowDegreeProver(this.air.field, this.indexGenerator, this.hashAlgorithm);
        this.serializer = new Serializer_1.Serializer(this.air);
        this.logger = logger || new utils_1.Logger();
    }
    // PROVER
    // --------------------------------------------------------------------------------------------
    prove(assertions, initValues, publicInputs, secretInputs) {
        const label = this.logger.start('Starting STARK computation');
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
        const pPolys = this.air.field.interpolateRoots(context.executionDomain, executionTrace);
        const pEvaluations = this.air.field.evalPolysAtRoots(pPolys, context.evaluationDomain);
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
        // first, compute inverse of Z(x)
        const zInverses = this.air.field.divVectorElements(zEvaluations.denominators, zEvaluations.numerators);
        this.logger.log(label, 'Computed Z(x) inverses');
        // then, multiply all values together to compute D(x)
        const dEvaluations = this.air.field.mulMatrixRows(qEvaluations, zInverses);
        this.logger.log(label, 'Computed D(x) polynomials');
        // 7 ----- compute boundary constraints B(x)
        const bPoly = new components_1.BoundaryConstraints(assertions, context);
        const bEvaluations = bPoly.evaluateAll(pEvaluations, context.evaluationDomain);
        this.logger.log(label, 'Computed B(x) polynomials');
        // 8 ----- build merkle tree for evaluations of P(x) and S(x)
        const hash = merkle_1.getHashFunction(this.hashAlgorithm);
        const hashedEvaluations = new Array(evaluationDomainSize);
        for (let i = 0; i < evaluationDomainSize; i++) {
            let v = this.serializer.mergeValues(pEvaluations, context.sEvaluations, i);
            hashedEvaluations[i] = hash(v);
        }
        this.logger.log(label, 'Serialized evaluations of P(x) and S(x) polynomials');
        const eTree = merkle_1.MerkleTree.create(hashedEvaluations, this.hashAlgorithm);
        this.logger.log(label, 'Built evaluation merkle tree');
        // 9 ----- spot check evaluation tree at pseudo-random positions
        const positions = this.indexGenerator.getExeIndexes(eTree.root, evaluationDomainSize);
        const augmentedPositions = this.getAugmentedPositions(positions, evaluationDomainSize);
        const eValues = new Array(augmentedPositions.length);
        for (let i = 0; i < augmentedPositions.length; i++) {
            let p = augmentedPositions[i];
            eValues[i] = this.serializer.mergeValues(pEvaluations, context.sEvaluations, p);
        }
        const eProof = eTree.proveBatch(augmentedPositions);
        this.logger.log(label, `Computed ${positions.length} evaluation spot checks`);
        // 10 ---- compute random linear combination of evaluations
        const lCombination = new components_1.LinearCombination(eTree.root, this.air.constraints, context);
        const lEvaluations = lCombination.computeMany(pEvaluations, context.sEvaluations, bEvaluations, dEvaluations);
        this.logger.log(label, 'Computed random linear combination of evaluations');
        // 11 ----- Compute low-degree proof
        const hashDigestSize = merkle_1.getHashDigestSize(this.hashAlgorithm);
        const lEvaluations2 = utils_1.vectorToBuffers(lEvaluations, hashDigestSize);
        const lTree = merkle_1.MerkleTree.create(lEvaluations2, this.hashAlgorithm);
        this.logger.log(label, 'Built liner combination merkle tree');
        const lcProof = lTree.proveBatch(positions);
        let ldProof;
        try {
            ldProof = this.ldProver.prove(lTree, lEvaluations, context.evaluationDomain, lCombination.combinationDegree);
        }
        catch (error) {
            throw new StarkError_1.StarkError('Low degree proof failed', error);
        }
        this.logger.log(label, 'Computed low-degree proof');
        this.logger.done(label, 'STARK computed');
        // build and return the proof object
        return {
            values: eValues,
            evProof: {
                root: eTree.root,
                nodes: eProof.nodes,
                depth: eProof.depth
            },
            lcProof: {
                root: lTree.root,
                nodes: lcProof.nodes,
                depth: lcProof.depth
            },
            ldProof: ldProof
        };
    }
    // VERIFIER
    // --------------------------------------------------------------------------------------------
    verify(assertions, proof, publicInputs) {
        const label = this.logger.start('Starting STARK verification');
        const eRoot = proof.evProof.root;
        const extensionFactor = this.air.extensionFactor;
        // 0 ----- validate parameters
        if (assertions.length < 1)
            throw new TypeError('At least one assertion must be provided');
        // 1 ----- set up evaluation context
        const context = this.air.createContext(publicInputs || []);
        const evaluationDomainSize = context.traceLength * extensionFactor;
        const bPoly = new components_1.BoundaryConstraints(assertions, context);
        const zPoly = new components_1.ZeroPolynomial(context);
        const lCombination = new components_1.LinearCombination(eRoot, this.air.constraints, context);
        this.logger.log(label, 'Set up evaluation context');
        // 2 ----- compute positions for evaluation spot-checks
        const positions = this.indexGenerator.getExeIndexes(eRoot, evaluationDomainSize);
        const augmentedPositions = this.getAugmentedPositions(positions, evaluationDomainSize);
        this.logger.log(label, `Computed positions for evaluation spot checks`);
        // 3 ----- decode evaluation spot-checks
        const pEvaluations = new Map();
        const sEvaluations = new Map();
        const hashedEvaluations = new Array(augmentedPositions.length);
        const hash = merkle_1.getHashFunction(this.hashAlgorithm);
        for (let i = 0; i < proof.values.length; i++) {
            let mergedEvaluations = proof.values[i];
            let position = augmentedPositions[i];
            let [p, s] = this.serializer.parseValues(mergedEvaluations);
            pEvaluations.set(position, p);
            sEvaluations.set(position, s);
            hashedEvaluations[i] = hash(mergedEvaluations);
        }
        this.logger.log(label, `Decoded evaluation spot checks`);
        // 4 ----- verify merkle proof for evaluation tree
        try {
            const evProof = {
                values: hashedEvaluations,
                nodes: proof.evProof.nodes,
                depth: proof.evProof.depth
            };
            if (!merkle_1.MerkleTree.verifyBatch(eRoot, augmentedPositions, evProof, this.hashAlgorithm)) {
                throw new StarkError_1.StarkError(`Verification of evaluation Merkle proof failed`);
            }
        }
        catch (error) {
            if (error instanceof StarkError_1.StarkError === false) {
                error = new StarkError_1.StarkError(`Verification of evaluation Merkle proof failed`, error);
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
            throw new StarkError_1.StarkError('Verification of low degree failed', error);
        }
        this.logger.log(label, `Verified low-degree proof`);
        // 6 ----- compute linear combinations of P, S, B, and D values for all spot checks
        const lcValues = new Array(positions.length);
        for (let i = 0; i < positions.length; i++) {
            let step = positions[i];
            let x = this.air.field.exp(context.rootOfUnity, BigInt(step));
            let pValues = pEvaluations.get(step);
            let nValues = pEvaluations.get((step + extensionFactor) % evaluationDomainSize);
            let sValues = sEvaluations.get(step);
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
            const hashDigestSize = merkle_1.getHashDigestSize(this.hashAlgorithm);
            const lcProof = {
                values: utils_1.vectorToBuffers(this.air.field.newVectorFrom(lcValues), hashDigestSize),
                nodes: proof.lcProof.nodes,
                depth: proof.lcProof.depth
            };
            if (!merkle_1.MerkleTree.verifyBatch(proof.lcProof.root, positions, lcProof, this.hashAlgorithm)) {
                throw new StarkError_1.StarkError(`Verification of linear combination Merkle proof failed`);
            }
        }
        catch (error) {
            if (error instanceof StarkError_1.StarkError === false) {
                error = new StarkError_1.StarkError(`Verification of linear combination Merkle proof failed`, error);
            }
            throw error;
        }
        this.logger.log(label, `Verified liner combination merkle proof`);
        this.logger.done(label, 'STARK verified');
        return true;
    }
    // UTILITIES
    // --------------------------------------------------------------------------------------------
    sizeOf(proof) {
        const size = utils_1.sizeOf(proof, this.hashAlgorithm);
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