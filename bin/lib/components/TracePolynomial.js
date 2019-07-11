"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// CLASS DEFINITION
// ================================================================================================
class TracePolynomial {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(config) {
        this.field = config.field;
        this.executionDomain = config.executionDomain;
        this.evaluationDomain = config.evaluationDomain;
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    evaluate(executionTrace) {
        const registerCount = executionTrace.length;
        // for each register in the execution trace, compute a polynomial and low-degree extend it
        const result = new Array(registerCount);
        for (let register = 0; register < registerCount; register++) {
            let p = this.field.interpolateRoots(this.executionDomain, executionTrace[register]);
            result[register] = this.field.evalPolyAtRoots(p, this.evaluationDomain);
        }
        return result;
    }
}
exports.TracePolynomial = TracePolynomial;
//# sourceMappingURL=TracePolynomial.js.map