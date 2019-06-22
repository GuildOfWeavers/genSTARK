// IMPORTS
// ================================================================================================
import { StarkConfig, TransitionFunction, FiniteField } from "@guildofweavers/air-script";
import { ComputedRegister, EvaluationContext, Assertion } from "@guildofweavers/genstark";
import { StarkError } from "../StarkError";

// CLASS DEFINITION
// ================================================================================================
export class ExecutionTraceBuilder {

    readonly field              : FiniteField;
    readonly registerCount      : number;
    readonly applyTransition    : TransitionFunction;
    readonly globalConstants    : any;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(config: StarkConfig) {
        this.field = config.field;
        this.registerCount = config.mutableRegisterCount;
        this.applyTransition = config.transitionFunction;
        this.globalConstants = config.globalConstants;
    }

    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    compute(context: EvaluationContext, inputs: bigint[][], kRegisters: ComputedRegister[]) {

        const steps = context.totalSteps;
        const iterationLength = context.roundSteps;

        const trace = new Array<bigint[]>(this.registerCount);
        const rValues = new Array<bigint>(this.registerCount);
        const nValues = new Array<bigint>(this.registerCount);
        const kValues = new Array<bigint>(kRegisters.length);

        try {
            // initialize execution trace with the first row of inputs
            for (let register = 0; register < trace.length; register++) {
                trace[register] = new Array<bigint>(steps);
                trace[register][0] = rValues[register] = inputs[register][0];
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
                let nextStep = step + 1;
                for (let register = 0; register < nValues.length; register++) {
                    if (nextStep % iterationLength === 0) {
                        trace[register][nextStep] = rValues[register] = inputs[register][nextStep / iterationLength];
                    }
                    else {
                        trace[register][nextStep] = rValues[register] = nValues[register];
                    }
                }
            }
        }
        catch (error) {
            throw new StarkError('Failed to generate execution trace', error);
        }

        return trace;
    }

    validateAssertions(trace: bigint[][], assertions: Assertion[]) {
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
                throw new StarkError(`Assertion at step ${a.step}, register ${a.register} conflicts with execution trace`);
            }
        }
    }
}