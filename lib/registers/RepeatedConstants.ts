// IMPORTS
// ================================================================================================
import { FiniteField, Polynom, EvaluationContext, ReadonlyRegister } from "@guildofweavers/genstark";

// CLASS DEFINITION
// ================================================================================================
export class RepeatedConstants implements ReadonlyRegister {

    readonly field          : FiniteField;
    readonly period         : bigint;
    readonly poly           : Polynom;
    readonly extensionFactor: number;

    extendedValues?         : bigint[];

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(values: bigint[], context: EvaluationContext, evaluatePoly: boolean) {
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
    getValue(step: number, skip: boolean): bigint {
        const values = this.extendedValues!;
        const position = skip ? step * this.extensionFactor : step;
        return values[position % values.length];
    }

    getValueAt(x: bigint): bigint {
        const xp = this.field.exp(x, this.period);
        return this.field.evalPolyAt(this.poly, xp);
    }
}