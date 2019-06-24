// IMPORTS
// ================================================================================================
import { StarkConfig, FiniteField, ConstraintEvaluator } from "@guildofweavers/air-script";
import { ComputedRegister, EvaluationContext } from "@guildofweavers/genstark";
import { RepeatedConstants } from "../registers";
import { StarkError } from "../StarkError";

// CLASS DEFINITION
// ================================================================================================
export class TransitionConstraintEvaluator {

    readonly field                  : FiniteField;
    readonly constraintCount        : number;
    readonly evaluateConstraints    : ConstraintEvaluator;
    readonly globalConstants        : any;
    readonly domainSize             : number;
    readonly extensionFactor        : number;
    readonly inputInjectionMask?    : ComputedRegister;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(config: StarkConfig, context: EvaluationContext) {
        this.field = config.field;
        this.constraintCount = config.constraintCount;
        this.evaluateConstraints = config.constraintEvaluator;
        this.globalConstants = config.globalConstants;

        this.domainSize = context.domainSize;
        this.extensionFactor = this.domainSize / context.totalSteps;

        // if multiple inputs have been provided, build input injection mask
        if (context.totalSteps !== context.roundSteps) {
            const iMaskValues = new Array<bigint>(context.roundSteps).fill(this.field.one);
            iMaskValues[iMaskValues.length - 1] = this.field.zero;
            this.inputInjectionMask = new RepeatedConstants(iMaskValues, context, true);
        }
    }

    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    evaluateAll(pEvaluations: bigint[][], kRegisters: ComputedRegister[]) {

        // initialize arrays for each constraint
        const evaluations = new Array<bigint[]>(this.constraintCount);
        for (let i = 0; i < this.constraintCount; i++) {
            evaluations[i] = new Array<bigint>(this.domainSize);
        }

        const nfSteps = this.domainSize - this.extensionFactor;
        const rValues = new Array<bigint>(pEvaluations.length);
        const nValues = new Array<bigint>(pEvaluations.length);
        const kValues = new Array<bigint>(kRegisters.length);
        const qValues = new Array<bigint>(this.constraintCount);

        try {
            for (let step = 0; step < this.domainSize; step++) {
                let inputInjectionFlag = this.inputInjectionMask
                    ? this.inputInjectionMask.getValue(step, false)
                    : undefined;

                // set values for mutable registers for current and next steps
                for (let register = 0; register < pEvaluations.length; register++) {
                    rValues[register] = pEvaluations[register][step];
    
                    let nextStepIndex = (step + this.extensionFactor) % this.domainSize;
                    nValues[register] = pEvaluations[register][nextStepIndex];
                }
    
                // calculate values of readonly registers for the current step
                for (let j = 0; j < kRegisters.length; j++) {
                    kValues[j] = kRegisters[j].getValue(step, false);
                }
    
                // populate qValues with results of constraint evaluations
                this.evaluateConstraints(rValues, nValues, kValues, this.globalConstants, qValues);
    
                // copy evaluations to the result, and also check that constraints evaluate to 0
                // at multiples of the extensions factor
                if (step % this.extensionFactor === 0 && step < nfSteps) {
                    for (let constraint = 0; constraint < this.constraintCount; constraint++) {
                        let qValue = qValues[constraint];
                        if (inputInjectionFlag !== undefined) {
                            qValue = this.field.mul(qValue, inputInjectionFlag)
                        }

                        if (qValue !== 0n) {
                            throw new Error(`Constraint ${constraint} didn't evaluate to 0 at step: ${step/this.extensionFactor}`);
                        }
                        evaluations[constraint][step] = qValue;
                    }
                }
                else {
                    for (let constraint = 0; constraint < this.constraintCount; constraint++) {
                        let qValue = qValues[constraint];
                        if (inputInjectionFlag !== undefined) {
                            qValue = this.field.mul(qValue, inputInjectionFlag)
                        }
                        evaluations[constraint][step] = qValue;
                    }
                }            
            }
        }
        catch (error) {
            throw new StarkError('Failed to evaluate transition constraints', error);
        }
        
        return evaluations;
    }

    evaluateOne(rValues: bigint[], nValues: bigint[], kValues: bigint[], step: number) {
        let inputInjectionFlag = this.inputInjectionMask
                    ? this.inputInjectionMask.getValue(step, false)
                    : undefined;

        const out = new Array<bigint>(this.constraintCount);
        this.evaluateConstraints(rValues, nValues, kValues, this.globalConstants, out);

        if (inputInjectionFlag !== undefined) {
            for (let constraint = 0; constraint < this.constraintCount; constraint++) {
                out[constraint] = this.field.mul(out[constraint], inputInjectionFlag);
            }   
        }        

        return out;
    }
}