"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// CLASS DEFINITION
// ================================================================================================
class RepeatedConstants {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(values, context, evaluatePoly) {
        // assert base length is power of 2
        // assert base lengths < steps
        this.field = context.field;
        this.period = BigInt(context.steps / values.length);
        this.extensionFactor = context.extensionFactor;
        const g = this.field.exp(context.rootOfUnity, BigInt(this.extensionFactor) * this.period);
        const roots = this.field.getPowerCycle(g);
        // assert roots.length == base.length
        this.poly = this.field.interpolateRoots(roots, values);
        if (evaluatePoly) {
            const g = this.field.exp(context.rootOfUnity, this.period);
            const domain = this.field.getPowerCycle(g);
            this.extendedValues = this.field.evalPolyAtRoots(this.poly, domain);
        }
    }
    // PUBLIC FUNCTIONS
    // --------------------------------------------------------------------------------------------
    getValue(step, skip) {
        const values = this.extendedValues;
        const position = skip ? step * this.extensionFactor : step;
        return values[position % values.length];
    }
    getValueAt(x) {
        const xp = this.field.exp(x, this.period);
        return this.field.evalPolyAt(this.poly, xp);
    }
}
exports.RepeatedConstants = RepeatedConstants;
//# sourceMappingURL=RepeatedConstants.js.map