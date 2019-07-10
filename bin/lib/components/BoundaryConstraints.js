"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// CLASS DEFINITION
// ================================================================================================
class BoundaryConstraints {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(assertions, context) {
        const field = this.field = context.field;
        const extensionFactor = context.extensionFactor;
        // combine constraints for each register
        const rData = new Map();
        for (let c of assertions) {
            let x = field.exp(context.rootOfUnity, BigInt(c.step * extensionFactor));
            let data = rData.get(c.register);
            if (data) {
                data.xs.push(x);
                data.ys.push(c.value);
                data.zPoly = this.field.mulPolys(data.zPoly, [-x, 1n]);
            }
            else {
                data = { xs: [x], ys: [c.value], zPoly: [-x, 1n] };
                rData.set(c.register, data);
            }
        }
        this.polys = new Map();
        for (let [register, data] of rData) {
            let iPoly = this.field.interpolate(data.xs, data.ys);
            this.polys.set(register, { iPoly, zPoly: data.zPoly });
        }
    }
    // PUBLIC ACCESSORS
    // --------------------------------------------------------------------------------------------
    get count() {
        return this.polys.size;
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    evaluateAt(pEvaluations, x) {
        let slot = 0;
        let bEvaluations = new Array(this.count);
        for (let [register, c] of this.polys) {
            let z = this.field.evalPolyAt(c.zPoly, x);
            let i = this.field.evalPolyAt(c.iPoly, x);
            let p = pEvaluations[register];
            // B(x) = (P(x) - I(x)) / Z(x)
            let b = this.field.div(this.field.sub(p, i), z);
            bEvaluations[slot] = b;
            slot++;
        }
        return bEvaluations;
    }
    evaluateAll(pEvaluations, domain) {
        const domainSize = domain.length;
        let slot = 0;
        const bEvaluations = new Array(this.count);
        for (let [register, c] of this.polys) {
            let iEvaluations = this.field.evalPolyAtRoots(c.iPoly, domain);
            let zEvaluations = this.field.evalPolyAtRoots(c.zPoly, domain);
            let zEvaluationsInverse = this.field.invMany(zEvaluations);
            bEvaluations[slot] = new Array(domainSize);
            // TODO: convert to batch operation
            for (let step = 0; step < domainSize; step++) {
                let p = pEvaluations[register][step];
                let i = iEvaluations[step];
                let zInverse = zEvaluationsInverse[step];
                // B(x) = (P(x) - I(x)) / Z(x)
                let b = this.field.mul(this.field.sub(p, i), zInverse);
                bEvaluations[slot][step] = b;
            }
            slot++;
        }
        return bEvaluations;
    }
}
exports.BoundaryConstraints = BoundaryConstraints;
//# sourceMappingURL=BoundaryConstraints.js.map