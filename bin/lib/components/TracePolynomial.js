"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// CLASS DEFINITION
// ================================================================================================
class TracePolynomial {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(field, executionTrace) {
        this.field = field;
        this.executionTrace = executionTrace;
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    evaluate({ executionDomain, evaluationDomain }) {
        const registerCount = this.executionTrace.length;
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