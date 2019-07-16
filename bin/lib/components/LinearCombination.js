"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// CLASS DEFINITION
// ================================================================================================
class LinearCombination {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(context, seed, constraints) {
        this.field = context.field;
        this.traceLength = context.traceLength;
        this.rootOfUnity = context.rootOfUnity;
        this.domainSize = this.traceLength * context.extensionFactor;
        this.coefficients = this.field.prng(seed, 256); // TODO: calculate intelligently
        this.constraintGroups = new Map();
        let maxDegree = 0;
        for (let i = 0; i < constraints.length; i++) {
            let degree = (constraints[i].degree - 1) * context.traceLength;
            let group = this.constraintGroups.get(degree);
            if (!group) {
                group = [];
                this.constraintGroups.set(degree, group);
            }
            group.push(i);
            if (maxDegree < degree) {
                maxDegree = degree;
            }
        }
        // the logic is as follows:
        // deg(Q(x)) = steps * deg(constraints) = deg(D(x)) + deg(Z(x))
        // thus, deg(D(x)) = deg(Q(x)) - steps;
        // and, linear combination degree is max(deg(D(x)), steps)
        this.combinationDegree = Math.max(maxDegree, context.traceLength);
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    computeMany(pEvaluations, sEvaluations, bEvaluations, dEvaluations) {
        let allEvaluations, psbPowers;
        // degree of P, S, and B evaluations is equal to trace length
        // here, we compute the degree by which P, S, B evaluations need to be increased
        // to match the degree of linear combination
        const psbIncrementalDegree = BigInt(this.combinationDegree - this.traceLength);
        // raise degree of D evaluations to match combination degree
        const dEvaluations2 = [];
        for (let [degree, indexes] of this.constraintGroups) {
            if (degree === this.combinationDegree)
                continue;
            // compute the sequence of powers for the incremental degree
            let incrementalDegree = BigInt(this.combinationDegree - degree);
            let powerSeed = this.field.exp(this.rootOfUnity, incrementalDegree);
            let powers = this.field.getPowerSeries(powerSeed, this.domainSize);
            // remember powers for P, S, B evaluations to avoid generating them twice
            if (incrementalDegree === psbIncrementalDegree) {
                psbPowers = powers;
            }
            // raise the degree of D evaluations
            for (let i of indexes) {
                dEvaluations2.push(this.field.mulVectorElements(dEvaluations[i], powers));
            }
        }
        // raise degree of P, S, B evaluations to match combination degree
        const psbEvaluations = [...pEvaluations, ...sEvaluations, ...bEvaluations];
        const psbEvaluations2 = [];
        if (psbIncrementalDegree > 0n) {
            // if incremental powers for P, S, B evaluations haven't been computed yet,
            // compute them now
            if (!psbPowers) {
                const powerSeed = this.field.exp(this.rootOfUnity, psbIncrementalDegree);
                psbPowers = this.field.getPowerSeries(powerSeed, this.domainSize);
            }
            // raise the degree of P, S, B evaluations
            for (let i = 0; i < psbEvaluations.length; i++) {
                psbEvaluations2.push(this.field.mulVectorElements(psbEvaluations[i], psbPowers));
            }
        }
        // put all evaluations together
        allEvaluations = [...psbEvaluations, ...psbEvaluations2, ...dEvaluations, ...dEvaluations2];
        // compute a linear combination of all evaluations
        this.coefficients.splice(allEvaluations.length); // TODO: remove
        return this.field.combineMany(allEvaluations, this.coefficients);
    }
    computeOne(x, pValues, sValues, bValues, dValues) {
        let allValues;
        // raise degree of D values, when needed
        let dValues2 = [];
        for (let [degree, indexes] of this.constraintGroups) {
            if (degree === this.combinationDegree)
                continue;
            let power = this.field.exp(x, BigInt(this.combinationDegree - degree));
            for (let i of indexes) {
                dValues2.push(this.field.mul(dValues[i], power));
            }
        }
        // raise degree of P, S, and B values, when needed
        const psbValues = [...pValues, ...sValues, ...bValues];
        let psbValues2 = [];
        if (this.combinationDegree > this.traceLength) {
            let power = this.field.exp(x, BigInt(this.combinationDegree - this.traceLength));
            psbValues2 = this.field.mulVectorElements(psbValues, power);
        }
        // put all evaluations together
        allValues = [...psbValues, ...psbValues2, ...dValues, ...dValues2];
        if (this.coefficients.length > allValues.length) {
            this.coefficients.splice(allValues.length); // TODO: remove
        }
        return this.field.combineVectors(allValues, this.coefficients);
    }
}
exports.LinearCombination = LinearCombination;
//# sourceMappingURL=LinearCombination.js.map