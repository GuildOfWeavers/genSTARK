"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// CLASS DEFINITION
// ================================================================================================
class ZeroPolynomial {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(context) {
        this.field = context.field;
        this.steps = BigInt(context.totalSteps);
        const rootOfUnity = context.rootOfUnity;
        const extensionFactor = context.domainSize / context.totalSteps;
        const position = (this.steps - 1n) * BigInt(extensionFactor);
        this.xAtLastStep = this.field.exp(rootOfUnity, position);
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    evaluateAt(x) {
        const xToTheSteps = this.field.exp(x, this.steps);
        const numValue = this.field.sub(xToTheSteps, 1n);
        const denValue = this.field.sub(x, this.xAtLastStep);
        const z = this.field.div(numValue, denValue);
        return z;
    }
    evaluateAll(domain) {
        const domainSize = domain.length;
        const steps = Number.parseInt(this.steps.toString(10), 10);
        const numEvaluations = new Array(domainSize);
        const denEvaluations = new Array(domainSize);
        for (let step = 0; step < domainSize; step++) {
            // calculate position of x^steps, and then just look it up
            let numIndex = (step * steps) % domainSize;
            numEvaluations[step] = this.field.sub(domain[numIndex], 1n);
            let x = domain[step];
            denEvaluations[step] = this.field.sub(x, this.xAtLastStep);
        }
        return { numerators: numEvaluations, denominators: denEvaluations };
    }
}
exports.ZeroPolynomial = ZeroPolynomial;
//# sourceMappingURL=ZeroPolynomial.js.map