"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const StarkError_1 = require("../StarkError");
// CLASS DEFINITION
// ================================================================================================
class ExecutionTraceBuilder {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(config) {
        this.field = config.field;
        this.applyTransition = config.transitionFunction;
        this.globalConstants = config.globalConstants;
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    compute(context, iRegisters, kRegisters) {
        const steps = context.totalSteps;
        const iterationLength = context.roundSteps;
        const trace = new Array(iRegisters.length);
        const rValues = new Array(iRegisters.length);
        const nValues = new Array(iRegisters.length);
        const kValues = new Array(kRegisters.length);
        try {
            // initialize execution trace with the first row of inputs
            for (let register = 0; register < trace.length; register++) {
                trace[register] = new Array(steps);
                trace[register][0] = rValues[register] = iRegisters[register].getValue(0, false);
            }
            // compute transition for every step
            for (let step = 0; step < steps - 1; step++) {
                // calculate values of readonly registers for the current step
                for (let j = 0; j < kValues.length; j++) {
                    kValues[j] = kRegisters[j].getValue(step, true);
                }
                // populate nValues with the next computation state
                this.applyTransition(rValues, kValues, this.globalConstants, nValues);
                // copy nValues to execution trace and update rValues for the next iteration
                for (let register = 0; register < nValues.length; register++) {
                    if ((step + 1) % iterationLength === 0) {
                        trace[register][step + 1] = nValues[register];
                        rValues[register] = iRegisters[register].getValue(step, false);
                    }
                    else {
                        trace[register][step + 1] = rValues[register] = nValues[register];
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