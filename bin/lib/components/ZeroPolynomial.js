"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// CLASS DEFINITION
// ================================================================================================
class ZeroPolynomial {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(context) {
        this.field = context.field;
        this.traceLength = BigInt(context.traceLength);
        const rootOfUnity = context.rootOfUnity;
        const extensionFactor = context.extensionFactor;
        const position = (this.traceLength - 1n) * BigInt(extensionFactor);
        this.xAtLastStep = this.field.exp(rootOfUnity, position);
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    evaluateAt(x) {
        const xToTheSteps = this.field.exp(x, this.traceLength);
        const numValue = this.field.sub(xToTheSteps, this.field.one);
        const denValue = this.field.sub(x, this.xAtLastStep);
        const z = this.field.div(numValue, denValue);
        return z;
    }
    evaluateAll(domain) {
        const domainSize = domain.length;
        const traceLength = Number.parseInt(this.traceLength.toString(10), 10);
        const xToTheSteps = this.field.pluckVector(domain, traceLength, domainSize);
        const numEvaluations = this.field.subVectorElements(xToTheSteps, this.field.one);
        const denEvaluations = this.field.subVectorElements(domain, this.xAtLastStep);
        return { numerators: numEvaluations, denominators: denEvaluations };
    }
}
exports.ZeroPolynomial = ZeroPolynomial;
//# sourceMappingURL=ZeroPolynomial.js.map