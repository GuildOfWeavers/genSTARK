"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// CLASS DEFINITION
// ================================================================================================
class InputRegister {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(values, context, domain) {
        const field = context.field;
        const iterationLength = context.domainSize / values.length;
        this.extensionFactor = context.domainSize / context.totalSteps;
        // create the polynomial
        const xs = new Array(values.length);
        for (let i = 0; i < xs.length; i++) {
            xs[i] = domain[i * iterationLength];
        }
        const poly = field.interpolate(xs, values);
        // evaluate the polynomial on the entire domain
        this.values = field.evalPolyAtRoots(poly, domain);
    }
    // PUBLIC FUNCTIONS
    // --------------------------------------------------------------------------------------------
    getValue(step, skip) {
        const position = skip ? step * this.extensionFactor : step;
        return this.values[position];
    }
    getValueAt(x) {
        throw new Error('not implemented');
    }
}
exports.InputRegister = InputRegister;
//# sourceMappingURL=InputRegister.js.map