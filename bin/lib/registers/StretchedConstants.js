"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// CLASS DEFINITION
// ================================================================================================
class StretchedConstants {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(values, context, domain) {
        // assert base length is power of 2
        // assert base lengths < steps
        const field = this.field = context.field;
        const steps = context.steps;
        this.extensionFactor = context.extensionFactor;
        const gap = steps / values.length;
        const mask = new Array(gap);
        mask[0] = 1n;
        for (let i = 1; i < mask.length; i++) {
            mask[i] = 0n;
        }
        this.maskPeriod = BigInt(steps / mask.length);
        const mg = field.exp(context.rootOfUnity, BigInt(this.extensionFactor) * this.maskPeriod);
        const mRoots = field.getPowerCycle(mg);
        this.maskPoly = field.interpolateRoots(mRoots, mask);
        const vg = field.exp(context.rootOfUnity, BigInt(this.extensionFactor * gap));
        const vRoots = field.getPowerCycle(vg);
        this.valuePoly = field.interpolate(vRoots, values);
        if (domain) {
            const g = this.field.exp(context.rootOfUnity, this.maskPeriod);
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
        const xp = this.field.exp(x, this.maskPeriod);
        const mask = this.field.evalPolyAt(this.maskPoly, xp);
        const value = this.field.evalPolyAt(this.valuePoly, x);
        return this.field.mul(mask, value);
    }
}
exports.StretchedConstants = StretchedConstants;
//# sourceMappingURL=StretchedConstants.js.map