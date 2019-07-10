// IMPORTS
// ================================================================================================
import { FiniteField } from '@guildofweavers/air-script';

// INTERFACES
// ================================================================================================
interface ZeroPolynomialConfig {
    readonly field              : FiniteField;
    readonly extensionFactor    : number;
    readonly rootOfUnity        : bigint;
    readonly traceLength        : number;
}

// CLASS DEFINITION
// ================================================================================================
export class ZeroPolynomial {

    readonly field          : FiniteField;
    readonly traceLength    : bigint;
    readonly xAtLastStep    : bigint;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(config: ZeroPolynomialConfig) {
        this.field = config.field;
        this.traceLength = BigInt(config.traceLength);

        const rootOfUnity = config.rootOfUnity;
        const extensionFactor = config.extensionFactor;
        const position = (this.traceLength - 1n) * BigInt(extensionFactor);
        
        this.xAtLastStep = this.field.exp(rootOfUnity, position);
    }

    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    evaluateAt(x: bigint): bigint {
        const xToTheSteps = this.field.exp(x, this.traceLength);
        const numValue = this.field.sub(xToTheSteps, 1n);
        const denValue = this.field.sub(x, this.xAtLastStep);
        const z = this.field.div(numValue, denValue);
        return z;
    }

    evaluateAll(domain: bigint[]) {
        const domainSize = domain.length;
        const traceLength = Number.parseInt(this.traceLength.toString(10), 10);

        const numEvaluations = new Array<bigint>(domainSize);
        const denEvaluations = new Array<bigint>(domainSize);
        for (let step = 0; step < domainSize; step++) {
            // calculate position of x^steps, and then just look it up
            let numIndex = (step * traceLength) % domainSize;
            numEvaluations[step] = this.field.sub(domain[numIndex], 1n);

            let x = domain[step];
            denEvaluations[step] = this.field.sub(x, this.xAtLastStep);
        }

        return { numerators: numEvaluations, denominators: denEvaluations };
    }
}