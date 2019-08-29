"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// CLASS DEFINITION
// ================================================================================================
class LinearCombination {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(seed, compositionDegree, coefficientOffset, context) {
        this.field = context.field;
        this.seed = seed;
        this.rootOfUnity = context.rootOfUnity;
        this.domainSize = context.traceLength * context.extensionFactor;
        this.coefficientOffset = coefficientOffset;
        // degree of P and S evaluations is equal to trace length
        // here, we compute the degree by which P and S evaluations need to be increased
        // to match the degree of composition polynomial
        this.psIncrementalDegree = BigInt(compositionDegree - context.traceLength);
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    computeMany(cEvaluations, pEvaluations, sEvaluations) {
        let allEvaluations;
        const pVectors = this.field.matrixRowsToVectors(pEvaluations);
        // raise degree of P, S, B evaluations to match combination degree        
        const psEvaluations = [...pVectors, ...sEvaluations];
        const psEvaluations2 = [];
        if (this.psIncrementalDegree > 0n) {
            const powerSeed = this.field.exp(this.rootOfUnity, this.psIncrementalDegree);
            const psPowers = this.field.getPowerSeries(powerSeed, this.domainSize);
            // raise the degree of P and S evaluations
            for (let i = 0; i < psEvaluations.length; i++) {
                psEvaluations2.push(this.field.mulVectorElements(psEvaluations[i], psPowers));
            }
        }
        // put all evaluations together
        allEvaluations = [...psEvaluations, ...psEvaluations2];
        // compute a linear combination of all evaluations
        let coefficients = this.field.prng(this.seed, this.coefficientOffset + allEvaluations.length).toValues();
        this.coefficients = this.field.newVectorFrom(coefficients.slice(this.coefficientOffset));
        const psCombination = this.field.combineManyVectors(allEvaluations, this.coefficients);
        // add P and S combination to C evaluations and return
        return this.field.addVectorElements(cEvaluations, psCombination);
    }
    computeOne(x, dValue, pValues, sValues) {
        let allValues;
        // raise degree of P and S values, when needed
        const psValues = [...pValues, ...sValues];
        let psVector = this.field.newVectorFrom(psValues);
        let psValues2 = [];
        if (this.psIncrementalDegree > 0n) {
            let power = this.field.exp(x, this.psIncrementalDegree);
            psValues2 = this.field.mulVectorElements(psVector, power).toValues();
        }
        // put all evaluations together
        allValues = this.field.newVectorFrom([...psValues, ...psValues2]);
        if (!this.coefficients) {
            let coefficients = this.field.prng(this.seed, this.coefficientOffset + allValues.length).toValues();
            this.coefficients = this.field.newVectorFrom(coefficients.slice(this.coefficientOffset));
        }
        const psCombination = this.field.combineVectors(allValues, this.coefficients);
        return this.field.add(dValue, psCombination);
    }
}
exports.LinearCombination = LinearCombination;
//# sourceMappingURL=LinearCombination.js.map