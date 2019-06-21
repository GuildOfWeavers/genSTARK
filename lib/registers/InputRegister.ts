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
        const iterationLength = context.domainSize / values.length;
        this.extensionFactor = context.domainSize / context.totalSteps;

        // create the polynomial
        const xs = new Array<bigint>(values.length);
        for (let i = 0; i < xs.length; i++) {
            xs[i] = domain[i * iterationLength];
        }
        const poly = field.interpolate(xs, values);

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