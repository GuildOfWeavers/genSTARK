// IMPORTS
// ================================================================================================
import { EvaluationContext, ComputedRegister } from "@guildofweavers/genstark";

// CLASS DEFINITION
// ================================================================================================
export class InputRegister implements ComputedRegister {

    readonly extensionFactor: number;
    readonly values         : bigint[];

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(values: bigint[], context: EvaluationContext, domain: bigint[]) {
        
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
    getValue(step: number, skip: boolean): bigint {   
        const position = skip ? step * this.extensionFactor : step;
        return this.values[position];
    }

    getValueAt(x: bigint): bigint {
        throw new Error('not implemented');
    }
}