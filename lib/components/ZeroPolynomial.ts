// IMPORTS
// ================================================================================================
import { FiniteField, EvaluationContext } from '@guildofweavers/genstark';

// CLASS DEFINITION
// ================================================================================================
export class ZeroPolynomial {

    readonly field      : FiniteField;
    readonly steps      : bigint;
    readonly xAtLastStep: bigint;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(context: EvaluationContext) {
        this.field = context.field;
        this.steps = BigInt(context.steps);

        const rootOfUnity = context.rootOfUnity;
        const position = (this.steps - 1n) * BigInt(context.extensionFactor);
        
        this.xAtLastStep = this.field.exp(rootOfUnity, position);
    }

    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    evaluateAt(x: bigint): bigint {
        const xToTheSteps = this.field.exp(x, this.steps);
        const numValue = this.field.sub(xToTheSteps, 1n);
        const denValue = this.field.sub(x, this.xAtLastStep);
        const z = this.field.div(numValue, denValue);
        return z;
    }

    evaluateAll(domain: bigint[]) {
        const domainSize = domain.length;
        const steps = Number.parseInt(this.steps.toString(10), 10);

        const numEvaluations = new Array<bigint>(domainSize);
        const denEvaluations = new Array<bigint>(domainSize);
        for (let step = 0; step < domainSize; step++) {
            // calculate position of x^steps, and then just look it up
            let numIndex = (step * steps) % domainSize;
            numEvaluations[step] = this.field.sub(domain[numIndex], 1n);

            let x = domain[step];
            denEvaluations[step] = this.field.sub(x, this.xAtLastStep);
        }

        return { numerators: numEvaluations, denominators: denEvaluations };
    }
}