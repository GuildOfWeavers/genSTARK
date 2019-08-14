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
            let zPoly = this.field.newVectorFrom([this.field.neg(x), this.field.one]);
            let data = rData.get(c.register);
            if (data) {
                data.xs.push(x);
                data.ys.push(c.value);
                data.zPoly = this.field.mulPolys(data.zPoly, zPoly);
            }
            else {
                data = { xs: [x], ys: [c.value], zPoly: zPoly };
                rData.set(c.register, data);
            }
        }
        this.polys = new Map();
        for (let [register, data] of rData) {
            let xs = this.field.newVectorFrom(data.xs);
            let ys = this.field.newVectorFrom(data.ys);
            let iPoly = this.field.interpolate(xs, ys);
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
        let bEvaluations = new Array();
        for (let [register, c] of this.polys) {
            let z = this.field.evalPolyAt(c.zPoly, x);
            let i = this.field.evalPolyAt(c.iPoly, x);
            let p = pEvaluations[register];
            // B(x) = (P(x) - I(x)) / Z(x)
            let b = this.field.div(this.field.sub(p, i), z);
            bEvaluations.push(b);
        }
        return bEvaluations;
    }
    evaluateAll(pEvaluations, domain) {
        const pVectors = this.field.matrixRowsToVectors(pEvaluations);
        const pValues = new Array();
        const iPolys = new Array();
        const zPolys = new Array();
        for (let [register, c] of this.polys) {
            pValues.push(pVectors[register]);
            iPolys.push(c.iPoly);
            zPolys.push(c.zPoly);
        }
        const iPolyMatrix = this.field.vectorsToMatrix(iPolys);
        const zPolyMatrix = this.field.vectorsToMatrix(zPolys);
        const iValues = this.field.evalPolysAtRoots(iPolyMatrix, domain);
        const zValues = this.field.evalPolysAtRoots(zPolyMatrix, domain);
        // B(x) = (P(x) - I(x)) / Z(x)
        const piValues = this.field.subMatrixElementsFromVectors(pValues, iValues);
        const bValues = this.field.divMatrixElements(piValues, zValues);
        return bValues;
    }
}
exports.BoundaryConstraints = BoundaryConstraints;
//# sourceMappingURL=BoundaryConstraints.js.map