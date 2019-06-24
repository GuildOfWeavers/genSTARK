"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const registers_1 = require("../registers");
const StarkError_1 = require("../StarkError");
// CLASS DEFINITION
// ================================================================================================
class TransitionConstraintEvaluator {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(config, context) {
        this.field = config.field;
        this.constraintCount = config.constraintCount;
        this.evaluateConstraints = config.constraintEvaluator;
        this.globalConstants = config.globalConstants;
        this.domainSize = context.domainSize;
        this.extensionFactor = this.domainSize / context.totalSteps;
        // if multiple inputs have been provided, build input injection mask
        if (context.totalSteps !== context.roundSteps) {
            const iMaskValues = new Array(context.roundSteps).fill(this.field.one);
            iMaskValues[iMaskValues.length - 1] = this.field.zero;
            this.inputInjectionMask = new registers_1.RepeatedConstants(iMaskValues, context, true);
        }
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    evaluateAll(pEvaluations, kRegisters) {
        // initialize arrays for each constraint
        const evaluations = new Array(this.constraintCount);
        for (let i = 0; i < this.constraintCount; i++) {
            evaluations[i] = new Array(this.domainSize);
        }
        const nfSteps = this.domainSize - this.extensionFactor;
        const rValues = new Array(pEvaluations.length);
        const nValues = new Array(pEvaluations.length);
        const kValues = new Array(kRegisters.length);
        const qValues = new Array(this.constraintCount);
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
                            qValue = this.field.mul(qValue, inputInjectionFlag);
                        }
                        if (qValue !== 0n) {
                            throw new Error(`Constraint ${constraint} didn't evaluate to 0 at step: ${step / this.extensionFactor}`);
                        }
                        evaluations[constraint][step] = qValue;
                    }
                }
                else {
                    for (let constraint = 0; constraint < this.constraintCount; constraint++) {
                        let qValue = qValues[constraint];
                        if (inputInjectionFlag !== undefined) {
                            qValue = this.field.mul(qValue, inputInjectionFlag);
                        }
                        evaluations[constraint][step] = qValue;
                    }
                }
            }
        }
        catch (error) {
            throw new StarkError_1.StarkError('Failed to evaluate transition constraints', error);
        }
        return evaluations;
    }
    evaluateOne(rValues, nValues, kValues, step) {
        let inputInjectionFlag = this.inputInjectionMask
            ? this.inputInjectionMask.getValue(step, false)
            : undefined;
        const out = new Array(this.constraintCount);
        this.evaluateConstraints(rValues, nValues, kValues, this.globalConstants, out);
        if (inputInjectionFlag !== undefined) {
            for (let constraint = 0; constraint < this.constraintCount; constraint++) {
                out[constraint] = this.field.mul(out[constraint], inputInjectionFlag);
            }
        }
        return out;
    }
}
exports.TransitionConstraintEvaluator = TransitionConstraintEvaluator;
//# sourceMappingURL=ConstraintEvaluator.js.map