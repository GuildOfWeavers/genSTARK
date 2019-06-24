"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// CLASS DEFINITION
// ================================================================================================
class TracePolynomial {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(context, executionTrace) {
        this.field = context.field;
        this.executionTrace = executionTrace;
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    evaluate(evaluationDomain) {
        const registerCount = this.executionTrace.length;
        const executionSteps = this.executionTrace[0].length;
        const extensionFactor = evaluationDomain.length / executionSteps;
        // compute execution domain
        const executionDomain = new Array(executionSteps);
        for (let step = 0; step < executionDomain.length; step++) {
            executionDomain[step] = evaluationDomain[step * extensionFactor];
        }
        // for each register in the execution trace, compute a polynomial and low-degree extend it
        const result = new Array(registerCount);
        for (let register = 0; register < registerCount; register++) {
            let p = this.field.interpolateRoots(executionDomain, this.executionTrace[register]);
            result[register] = this.field.evalPolyAtRoots(p, evaluationDomain);
        }
        return result;
    }
}
exports.TracePolynomial = TracePolynomial;
//# sourceMappingURL=TracePolynomial.js.map