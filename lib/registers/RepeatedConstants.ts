// IMPORTS
// ================================================================================================
import { FiniteField, Polynom, EvaluationContext, ComputedRegister } from "@guildofweavers/genstark";

// CLASS DEFINITION
// ================================================================================================
export class RepeatedConstants implements ComputedRegister {

    readonly field          : FiniteField;
    readonly periods        : bigint;
    readonly poly           : Polynom;
    readonly extensionFactor: number;

    extendedValues?         : bigint[];

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(values: bigint[], context: EvaluationContext, evaluatePoly: boolean) {
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
    getValue(step: number, skip: boolean): bigint {
        const values = this.extendedValues!;
        const position = skip ? step * this.extensionFactor : step;
        return values[position % values.length];
    }

    getValueAt(x: bigint): bigint {
        const xp = this.field.exp(x, this.periods);
        return this.field.evalPolyAt(this.poly, xp);
    }
}