"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const StarkError_1 = require("../StarkError");
// CLASS DEFINITION
// ================================================================================================
class ExecutionTraceBuilder {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(config, context) {
        this.field = config.field;
        this.steps = context.totalSteps;
        this.iterationLength = context.roundSteps;
        this.registerCount = config.mutableRegisterCount;
        this.applyTransition = config.transitionFunction;
        this.globalConstants = config.globalConstants;
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    compute(inputs, kRegisters) {
        const steps = this.steps;
        const iterationLength = this.iterationLength;
        const trace = new Array(this.registerCount);
        try {
            // initialize execution trace with the first row of inputs
            const rValues = inputs[0];
            for (let register = 0; register < trace.length; register++) {
                trace[register] = new Array(steps);
                trace[register][0] = rValues[register];
            }
            const nValues = new Array(this.registerCount);
            const kValues = new Array(kRegisters.length);
            // compute transition for every step
            for (let step = 0; step < steps - 1; step++) {
                // calculate values of readonly registers for the current step
                for (let j = 0; j < kValues.length; j++) {
                    kValues[j] = kRegisters[j].getValue(step, true);
                }
                // populate nValues with the next computation state
                this.applyTransition(rValues, kValues, this.globalConstants, nValues);
                // copy nValues to execution trace and update rValues for the next iteration
                let nextStep = step + 1;
                for (let register = 0; register < nValues.length; register++) {
                    if (nextStep % iterationLength === 0) {
                        trace[register][nextStep] = rValues[register] = inputs[nextStep / iterationLength][register];
                    }
                    else {
                        trace[register][nextStep] = rValues[register] = nValues[register];
                    }
                }
            }
        }
        catch (error) {
            throw new StarkError_1.StarkError('Failed to generate execution trace', error);
        }
        return trace;
    }
    validateAssertions(trace, assertions) {
        const registers = trace.length;
        const steps = trace[0].length;
        for (let a of assertions) {
            // make sure register references are correct
            if (a.register < 0 || a.register >= registers) {
                throw new Error(`Invalid assertion: register ${a.register} is outside of register bank`);
            }
            // make sure steps are correct
            if (a.step < 0 || a.step >= steps) {
                throw new Error(`Invalid assertion: step ${a.step} is outside of execution trace`);
            }
            // make sure assertions don't contradict execution trace
            if (trace[a.register][a.step] !== a.value) {
                throw new StarkError_1.StarkError(`Assertion at step ${a.step}, register ${a.register} conflicts with execution trace`);
            }
        }
    }
}
exports.ExecutionTraceBuilder = ExecutionTraceBuilder;
//# sourceMappingURL=TraceBuilder.js.map