// IMPORTS
// ================================================================================================
import { FiniteField } from '@guildofweavers/air-script';

// INTERFACES
// ================================================================================================
interface TracePolynomialConfig {
    readonly field              : FiniteField;
    readonly executionDomain    : bigint[];
    readonly evaluationDomain   : bigint[];
}

// CLASS DEFINITION
// ================================================================================================
export class TracePolynomial {

    readonly field              : FiniteField;
    readonly executionDomain    : bigint[];
    readonly evaluationDomain   : bigint[];
    
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(config: TracePolynomialConfig) {
        this.field = config.field;
        this.executionDomain = config.executionDomain;
        this.evaluationDomain = config.evaluationDomain;
    }

    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    evaluate(executionTrace: bigint[][]) {

        const registerCount = executionTrace.length;

        // for each register in the execution trace, compute a polynomial and low-degree extend it
        const result = new Array<bigint[]>(registerCount);
        for (let register = 0; register < registerCount; register++) {
            let p = this.field.interpolateRoots(this.executionDomain, executionTrace[register]);
            result[register] = this.field.evalPolyAtRoots(p, this.evaluationDomain);
        }

        return result;
    }
}