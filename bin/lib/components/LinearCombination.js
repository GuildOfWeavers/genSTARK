"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// CLASS DEFINITION
// ================================================================================================
class LinearCombination {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(context, seed, constraintCount, maxConstraintDegree) {
        this.field = context.field;
        this.traceLength = context.traceLength;
        this.rootOfUnity = context.rootOfUnity;
        this.domainSize = this.traceLength * context.extensionFactor;
        this.coefficients = this.field.prng(seed, 256); // TODO: calculate intelligently
        // the logic is as follows:
        // deg(Q(x)) = steps * deg(constraints) = deg(D(x)) + deg(Z(x))
        // thus, deg(D(x)) = deg(Q(x)) - steps;
        // and, linear combination degree is max(deg(D(x)), steps)
        this.combinationDegree = context.traceLength * Math.max(maxConstraintDegree - 1, 1);
        // TODO: use actual constraint degrees in the future
        this.constraintDegrees = new Array(constraintCount).fill(maxConstraintDegree);
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    computeMany(pEvaluations, sEvaluations, bEvaluations, dEvaluations) {
        let allEvaluations;
        // TODO: get rid of conditional logic in favor of degree normalization
        if (this.combinationDegree > this.traceLength) {
            // normalize degrees of P(x) and B(x) polynomials
            const psbEvaluations = [...pEvaluations, ...sEvaluations, ...bEvaluations];
            const psbEvaluations2 = this.normalizeDegree(psbEvaluations, this.traceLength);
            allEvaluations = [...psbEvaluations2, ...psbEvaluations, ...dEvaluations];
        }
        else {
            // increase degree of D(x) polynomial
            const dPowerSeed = this.field.exp(this.rootOfUnity, BigInt(this.traceLength - 1));
            const powers = this.field.getPowerSeries(dPowerSeed, this.domainSize);
            const dEvaluations2 = this.field.mulMany(dEvaluations, powers);
            allEvaluations = [...pEvaluations, ...sEvaluations, ...bEvaluations, ...dEvaluations2];
        }
        // then compute a linear combination of all polynomials
        this.coefficients.splice(allEvaluations.length); // TODO: remove
        return this.field.combineMany(allEvaluations, this.coefficients);
    }
    computeOne(x, pValues, sValues, bValues, dValues) {
        let lcValues;
        if (this.combinationDegree > this.traceLength) {
            let power = this.field.exp(x, BigInt(this.combinationDegree - this.traceLength));
            let psbValues = [...pValues, ...sValues, ...bValues];
            let psbValues2 = new Array(psbValues.length);
            for (let j = 0; j < psbValues2.length; j++) {
                psbValues2[j] = this.field.mul(psbValues[j], power);
            }
            lcValues = [...psbValues2, ...psbValues, ...dValues];
        }
        else {
            let power = this.field.exp(x, BigInt(this.traceLength - 1));
            let dValues2 = new Array(dValues.length);
            for (let j = 0; j < dValues2.length; j++) {
                dValues2[j] = this.field.mul(dValues[j], power);
            }
            lcValues = [...pValues, ...sValues, ...bValues, ...dValues2];
        }
        if (this.coefficients.length > lcValues.length) {
            this.coefficients.splice(lcValues.length); // TODO: remove
        }
        return this.field.combine(lcValues, this.coefficients);
    }
    // PRIVATE METHODS
    // --------------------------------------------------------------------------------------------
    normalizeDegree(source, sourceDegree) {
        if (sourceDegree === this.combinationDegree)
            return [];
        const incrementalDegree = BigInt(this.combinationDegree - sourceDegree);
        const powerSeed = this.field.exp(this.rootOfUnity, incrementalDegree);
        const powers = this.field.getPowerSeries(powerSeed, this.domainSize);
        const result = new Array(source.length);
        for (let i = 0; i < result.length; i++) {
            result[i] = this.field.mulVectorElements(source[i], powers);
        }
        return result;
    }
}
exports.LinearCombination = LinearCombination;
//# sourceMappingURL=LinearCombination.js.map