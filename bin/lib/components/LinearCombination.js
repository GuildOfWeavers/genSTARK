"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// CLASS DEFINITION
// ================================================================================================
class LinearCombination {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(seed, constraints, context) {
        this.field = context.field;
        this.seed = seed;
        this.rootOfUnity = context.rootOfUnity;
        this.domainSize = context.traceLength * context.extensionFactor;
        const zeroPolyDegree = context.traceLength;
        // determine max constraint degree,
        // and group transition constraints together by their degree
        let maxDegree = 0;
        const constraintGroups = new Map();
        for (let i = 0; i < constraints.length; i++) {
            let degree = (constraints[i].degree * context.traceLength) - zeroPolyDegree;
            let group = constraintGroups.get(degree);
            if (!group) {
                group = [];
                constraintGroups.set(degree, group);
            }
            group.push(i);
            if (maxDegree < degree) {
                maxDegree = degree;
            }
        }
        // compute degree of linear combination, the logic is as follows:
        // deg(Q(x)) = steps * deg(constraints) = deg(D(x)) + deg(Z(x))
        // thus, deg(D(x)) = deg(Q(x)) - steps;
        // and, linear combination degree is max(deg(D(x)), steps)
        this.combinationDegree = Math.max(maxDegree, context.traceLength);
        // initialize transition constraint groups
        this.constraintGroups = [];
        for (let [degree, indexes] of constraintGroups) {
            this.constraintGroups.push({ degree, indexes });
        }
        // degree of P, S, and B evaluations is equal to trace length
        // here, we compute the degree by which P, S, B evaluations need to be increased
        // to match the degree of linear combination
        this.psbIncrementalDegree = BigInt(this.combinationDegree - context.traceLength);
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    computeMany(pEvaluations, sEvaluations, bEvaluations, dEvaluations) {
        let allEvaluations, psbPowers;
        const pVectors = this.field.matrixRowsToVectors(pEvaluations);
        const bVectors = this.field.matrixRowsToVectors(bEvaluations);
        const dVectors = this.field.matrixRowsToVectors(dEvaluations);
        // raise degree of D evaluations to match combination degree
        const dEvaluations2 = [];
        for (let { degree, indexes } of this.constraintGroups) {
            if (degree === this.combinationDegree)
                continue;
            // compute the sequence of powers for the incremental degree
            let incrementalDegree = BigInt(this.combinationDegree - degree);
            let powerSeed = this.field.exp(this.rootOfUnity, incrementalDegree);
            let powers = this.field.getPowerSeries(powerSeed, this.domainSize);
            // remember powers for P, S, B evaluations to avoid generating them twice
            if (incrementalDegree === this.psbIncrementalDegree) {
                psbPowers = powers;
            }
            // raise the degree of D evaluations
            for (let i of indexes) {
                dEvaluations2.push(this.field.mulVectorElements(dVectors[i], powers));
            }
        }
        // raise degree of P, S, B evaluations to match combination degree        
        const psbEvaluations = [...pVectors, ...sEvaluations, ...bVectors];
        const psbEvaluations2 = [];
        if (this.psbIncrementalDegree > 0n) {
            // if incremental powers for P, S, B evaluations haven't been computed yet,
            // compute them now
            if (!psbPowers) {
                const powerSeed = this.field.exp(this.rootOfUnity, this.psbIncrementalDegree);
                psbPowers = this.field.getPowerSeries(powerSeed, this.domainSize);
            }
            // raise the degree of P, S, B evaluations
            for (let i = 0; i < psbEvaluations.length; i++) {
                psbEvaluations2.push(this.field.mulVectorElements(psbEvaluations[i], psbPowers));
            }
        }
        // put all evaluations together
        allEvaluations = [...dVectors, ...dEvaluations2, ...psbEvaluations, ...psbEvaluations2];
        // compute a linear combination of all evaluations
        this.coefficients = this.field.prng(this.seed, allEvaluations.length);
        return this.field.combineManyVectors(allEvaluations, this.coefficients);
    }
    computeOne(x, pValues, sValues, bValues, dValues) {
        let allValues;
        // raise degree of D values, when needed
        let dValues2 = [];
        for (let { degree, indexes } of this.constraintGroups) {
            if (degree === this.combinationDegree)
                continue;
            let constraintIncrementalDegree = BigInt(this.combinationDegree - degree);
            let power = this.field.exp(x, constraintIncrementalDegree);
            for (let i of indexes) {
                dValues2.push(this.field.mul(dValues[i], power));
            }
        }
        // raise degree of P, S, and B values, when needed
        const psbValues = [...pValues, ...sValues, ...bValues];
        let psbVector = this.field.newVectorFrom(psbValues);
        let psbValues2 = [];
        if (this.psbIncrementalDegree > 0n) {
            let power = this.field.exp(x, this.psbIncrementalDegree);
            psbValues2 = this.field.mulVectorElements(psbVector, power).toValues();
        }
        // put all evaluations together
        allValues = this.field.newVectorFrom([...dValues, ...dValues2, ...psbValues, ...psbValues2]);
        if (!this.coefficients) {
            this.coefficients = this.field.prng(this.seed, allValues.length);
        }
        return this.field.combineVectors(allValues, this.coefficients);
    }
}
exports.LinearCombination = LinearCombination;
//# sourceMappingURL=LinearCombination.js.map