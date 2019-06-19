"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// CLASS DEFINITION
// ================================================================================================
class SpreadConstants {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(values, context, domain) {
        if (values.length > context.totalSteps) {
            throw new Error('Number of steps must be greater than the constant cycle');
        }
        if (context.totalSteps % values.length !== 0) {
            throw new Error('Constant cycle must evenly divide the number of steps');
        }
        const field = this.field = context.field;
        const steps = context.totalSteps;
        this.extensionFactor = context.domainSize / context.totalSteps;
        // create mask polynomial
        const maskPeriods = steps / values.length;
        this.maskPeriods = BigInt(maskPeriods);
        const mask = new Array(maskPeriods);
        mask[0] = 1n;
        for (let i = 1; i < mask.length; i++) {
            mask[i] = 0n;
        }
        const mg = field.exp(context.rootOfUnity, BigInt(this.extensionFactor * values.length));
        const mRoots = field.getPowerCycle(mg);
        this.maskPoly = field.interpolateRoots(mRoots, mask);
        // create value polynomial
        const vg = field.exp(context.rootOfUnity, BigInt(this.extensionFactor * maskPeriods));
        const vRoots = field.getPowerCycle(vg);
        this.valuePoly = field.interpolate(vRoots, values);
        // if domain is provided, evaluate mask and value polynomials over it
        if (domain) {
            const g = this.field.exp(context.rootOfUnity, this.maskPeriods);
            const maskDomain = this.field.getPowerCycle(g);
            this.extendedMask = this.field.evalPolyAtRoots(this.maskPoly, maskDomain);
            this.extendedValues = this.field.evalPolyAtRoots(this.valuePoly, domain);
        }
    }
    // PUBLIC FUNCTIONS
    // --------------------------------------------------------------------------------------------
    getValue(step, skip) {
        const masks = this.extendedMask;
        const values = this.extendedValues;
        const position = skip ? step * this.extensionFactor : step;
        const mask = masks[position % masks.length];
        const value = values[position];
        return this.field.mul(mask, value);
    }
    getValueAt(x) {
        const xp = this.field.exp(x, this.maskPeriods);
        const mask = this.field.evalPolyAt(this.maskPoly, xp);
        const value = this.field.evalPolyAt(this.valuePoly, x);
        return this.field.mul(mask, value);
    }
}
exports.SpreadConstants = SpreadConstants;
//# sourceMappingURL=SpreadConstants.js.map