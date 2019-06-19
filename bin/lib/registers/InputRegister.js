"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// CLASS DEFINITION
// ================================================================================================
class InputRegister {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(values, context, domain) {
        const field = context.field;
        const steps = context.totalSteps;
        const iterationLength = steps / values.length;
        this.extensionFactor = context.domainSize / context.totalSteps;
        // create the polynomial
        const g = field.exp(context.rootOfUnity, BigInt(this.extensionFactor * iterationLength));
        const xs = field.getPowerCycle(g);
        const poly = field.interpolate(xs, values); // FUTURE: interpolate roots?
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