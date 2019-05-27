// IMPORTS
// ================================================================================================
import { ExecutionFrame, EvaluationFrame, ReadonlyRegister, FiniteField } from '@guildofweavers/genstark';

// CLASS DEFINITION
// ================================================================================================
export class ProofFrame implements ExecutionFrame, EvaluationFrame {

    readonly field          : FiniteField;
    readonly domainSize     : number;
    readonly trace          : bigint[][];
    readonly constants      : ReadonlyRegister[];
    readonly skip           : number;
    
    currentStep             : number;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(field: FiniteField, trace: bigint[][], constants: ReadonlyRegister[], skip = 1) {
        this.field = field;
        this.domainSize = trace[0].length;
        this.trace = trace;
        this.constants = constants;

        this.skip = skip;
        this.currentStep = 0;
    }

    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    getValue(index: number): bigint {
        const maxIndex = this.trace.length - 1;
        if (index < 0 || index > maxIndex) {
            throw new Error(`Register index must be an integer between 0 and ${maxIndex}`);
        }
        return this.trace[index][this.currentStep];
    }

    getConst(index: number): bigint {
        const maxIndex = this.constants.length - 1;
        if (index < 0 || index > maxIndex) {
            throw new Error(`Constant index must be an integer between 0 and ${maxIndex}`);
        }

        const k = this.constants[index];
        return k.getValue(this.currentStep, this.skip === 1);
    }

    getNextValue(index: number): bigint {
        const maxIndex = this.trace.length - 1;
        if (index < 0 || index > maxIndex) {
            throw new Error(`Register index must be an integer between 0 and ${maxIndex}`);
        }

        if (this.skip === 1) {
            throw new Error('Cannot get next value in an execution frame');
        }

        const step = (this.currentStep + this.skip) % this.domainSize;
        return this.trace[index][step];
    }

    setNextValue(index: number, value: bigint) {
        const maxIndex = this.trace.length - 1;
        if (index < 0 || index > maxIndex) {
            throw new Error(`Register index must be an integer between 0 and ${maxIndex}`);
        }

        if (this.skip !== 1) {
            throw new Error('Cannot set next value in an evaluation frame');
        }

        const step = (this.currentStep + this.skip) % this.domainSize;
        this.trace[index][step] = value;
    }

    // MATH OPERATIONS
    // --------------------------------------------------------------------------------------------
    add(a: bigint, b: bigint): bigint {
        return this.field.add(a, b);
    }

    sub(a: bigint, b: bigint): bigint {
        return this.field.sub(a, b);
    }

    mul(a: bigint, b: bigint): bigint {
        return this.field.mul(a, b);
    }

    div(a: bigint, b: bigint): bigint {
        return this.field.div(a, b);
    }

    exp(a: bigint, b: bigint): bigint {
        return this.field.exp(a, b);
    }
}