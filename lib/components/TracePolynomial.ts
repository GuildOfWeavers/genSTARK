// IMPORTS
// ================================================================================================
import { FiniteField } from '@guildofweavers/air-script';

// INTERFACES
// ================================================================================================
interface DomainParams {
    executionDomain : bigint[];
    evaluationDomain: bigint[];
}

// CLASS DEFINITION
// ================================================================================================
export class TracePolynomial {

    readonly field              : FiniteField;
    readonly executionTrace     : bigint[][];
    
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(field: FiniteField, executionTrace: bigint[][]) {
        this.field = field;
        this.executionTrace = executionTrace;
    }

    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    evaluate({ executionDomain, evaluationDomain }: DomainParams) {

        const registerCount = this.executionTrace.length;

        // for each register in the execution trace, compute a polynomial and low-degree extend it
        const result = new Array<bigint[]>(registerCount);
        for (let register = 0; register < registerCount; register++) {
            let p = this.field.interpolateRoots(executionDomain, this.executionTrace[register]);
            result[register] = this.field.evalPolyAtRoots(p, evaluationDomain);
        }

        return result;
    }
}