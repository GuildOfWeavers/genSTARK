"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// CLASS DEFINITION
// ================================================================================================
class RepeatedConstants {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(values, context, evaluatePoly) {
        if (values.length > context.totalSteps) {
            throw new Error('Number of steps must be greater than the constant cycle');
        }
        if (context.totalSteps % values.length !== 0) {
            throw new Error('Constant cycle must evenly divide the number of steps');
        }
        this.field = context.field;
        this.periods = BigInt(context.totalSteps / values.length);
        this.extensionFactor = context.domainSize / context.totalSteps;
        const g = this.field.exp(context.rootOfUnity, BigInt(this.extensionFactor) * this.periods);
        const roots = this.field.getPowerCycle(g);
        if (roots.length !== values.length) {
            throw new Error('Number of roots of unity does not match constant cycle');
        }
        this.poly = this.field.interpolateRoots(roots, values);
        if (evaluatePoly) {
            const eg = this.field.exp(context.rootOfUnity, this.periods);
            const domain = this.field.getPowerCycle(eg);
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
        const xp = this.field.exp(x, this.periods);
        return this.field.evalPolyAt(this.poly, xp);
    }
}
exports.RepeatedConstants = RepeatedConstants;
//# sourceMappingURL=RepeatedConstants.js.map