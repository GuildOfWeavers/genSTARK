"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const registers_1 = require("../registers");
const StarkError_1 = require("../StarkError");
// CLASS DEFINITION
// ================================================================================================
class TransitionConstraintEvaluator {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(config) {
        this.field = config.field;
        this.constraintCount = config.constraintCount;
        this.evaluateConstraints = config.constraintEvaluator;
        this.globalConstants = config.globalConstants;
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    evaluateAll(context, pEvaluations, iRegisters, kRegisters) {
        const domainSize = context.domainSize;
        const iterationLength = context.roundSteps;
        const extensionFactor = domainSize / context.totalSteps;
        // initialize arrays for each constraint
        const evaluations = new Array(this.constraintCount);
        for (let i = 0; i < this.constraintCount; i++) {
            evaluations[i] = new Array(domainSize);
        }
        // build input mask
        const iMaskValues = new Array(iterationLength).fill(0n);
        iMaskValues[0] = 1n;
        const iMask = new registers_1.RepeatedConstants(iMaskValues, context, true);
        const nfSteps = domainSize - extensionFactor;
        const rValues = new Array(iRegisters.length);
        const nValues = new Array(iRegisters.length);
        const kValues = new Array(kRegisters.length);
        const qValues = new Array(this.constraintCount);
        try {
            for (let step = 0; step < domainSize; step++) {
                let c1 = iMask.getValue(step, false);
                let c2 = this.field.sub(this.field.one, c1);
                // calculate values for mutable registers for current and next steps
                for (let register = 0; register < iRegisters.length; register++) {
                    let iValue = this.field.mul(iRegisters[register].getValue(step, false), c1);
                    let rValue = this.field.mul(pEvaluations[register][step], c2);
                    rValues[register] = this.field.add(rValue, iValue);
                    let nextStepIndex = (step + extensionFactor) % domainSize;
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
                if (step % extensionFactor === 0 && step < nfSteps) {
                    for (let constraint = 0; constraint < this.constraintCount; constraint++) {
                        let qValue = qValues[constraint];
                        if (qValue !== 0n) {
                            throw new Error(`Constraint ${constraint} didn't evaluate to 0 at step: ${step / extensionFactor}`);
                        }
                        evaluations[constraint][step] = qValue;
                    }
                }
                else {
                    for (let constraint = 0; constraint < this.constraintCount; constraint++) {
                        evaluations[constraint][step] = qValues[constraint];
                    }
                }
            }
        }
        catch (error) {
            throw new StarkError_1.StarkError('Failed to evaluate transition constraints', error);
        }
        return evaluations;
    }
    evaluateOne(rValues, nValues, kValues, iValues) {
        const out = new Array(this.constraintCount);
        this.evaluateConstraints(rValues, nValues, kValues, this.globalConstants, out);
        return out;
    }
}
exports.TransitionConstraintEvaluator = TransitionConstraintEvaluator;
//# sourceMappingURL=ConstraintEvaluator.js.map