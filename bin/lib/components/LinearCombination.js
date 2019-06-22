"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// CLASS DEFINITION
// ================================================================================================
class LinearCombination {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(context, seed) {
        // the logic is as follows:
        // deg(Q(x)) = steps * deg(constraints) = deg(D(x)) + deg(Z(x))
        // thus, deg(D(x)) = deg(Q(x)) - steps;
        // and, linear combination degree is max(deg(D(x)), steps)
        this.degree = context.totalSteps * Math.max(context.constraintDegree - 1, 1);
        this.field = context.field;
        this.steps = context.totalSteps;
        this.rootOfUnity = context.rootOfUnity;
        this.domainSize = context.domainSize;
        this.coefficients = this.field.prng(seed, 256); // TODO: calculate intelligently
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    computeMany(pEvaluations, bEvaluations, dEvaluations) {
        let allEvaluations;
        if (this.degree > this.steps) {
            // increase degrees of P(x) and B(x) polynomials
            const pbIncrementalDegree = BigInt(this.degree - this.steps);
            const pbPowerSeed = this.field.exp(this.rootOfUnity, pbIncrementalDegree);
            const powers = this.field.getPowerSeries(pbPowerSeed, this.domainSize);
            const pbEvaluations = [...pEvaluations, ...bEvaluations];
            const pbEvaluations2 = this.field.mulMany(pbEvaluations, powers);
            allEvaluations = [...pbEvaluations2, ...pbEvaluations, ...dEvaluations];
        }
        else {
            // increase degree of D(x) polynomial
            const dPowerSeed = this.field.exp(this.rootOfUnity, BigInt(this.steps - 1));
            const powers = this.field.getPowerSeries(dPowerSeed, this.domainSize);
            const dEvaluations2 = this.field.mulMany(dEvaluations, powers);
            allEvaluations = [...pEvaluations, ...bEvaluations, ...dEvaluations2];
        }
        // then compute a linear combination of all polynomials
        this.coefficients.splice(allEvaluations.length); // TODO: remove
        return this.field.combineMany(allEvaluations, this.coefficients);
    }
    computeOne(x, pValues, bValues, dValues) {
        let lcValues;
        if (this.degree > this.steps) {
            let power = this.field.exp(x, BigInt(this.degree - this.steps));
            let pbValues = [...pValues, ...bValues];
            let pbValues2 = new Array(pbValues.length);
            for (let j = 0; j < pbValues2.length; j++) {
                pbValues2[j] = this.field.mul(pbValues[j], power);
            }
            lcValues = [...pbValues2, ...pbValues, ...dValues];
        }
        else {
            let power = this.field.exp(x, BigInt(this.steps - 1));
            let dValues2 = new Array(dValues.length);
            for (let j = 0; j < dValues2.length; j++) {
                dValues2[j] = this.field.mul(dValues[j], power);
            }
            lcValues = [...pValues, ...bValues, ...dValues2];
        }
        if (this.coefficients.length > lcValues.length) {
            this.coefficients.splice(lcValues.length); // TODO: remove
        }
        return this.field.combine(lcValues, this.coefficients);
    }
}
exports.LinearCombination = LinearCombination;
//# sourceMappingURL=LinearCombination.js.map