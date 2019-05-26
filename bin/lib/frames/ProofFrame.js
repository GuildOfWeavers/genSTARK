"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// CLASS DEFINITION
// ================================================================================================
class ProofFrame {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(trace, constants, skip = 1) {
        this.domainSize = trace[0].length;
        this.trace = trace;
        this.constants = constants;
        this.skip = skip;
        this.currentStep = 0;
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    getValue(index) {
        const maxIndex = this.trace.length - 1;
        if (index < 0 || index > maxIndex) {
            throw new Error(`Register index must be an integer between 0 and ${maxIndex}`);
        }
        return this.trace[index][this.currentStep];
    }
    getConst(index) {
        const maxIndex = this.constants.length - 1;
        if (index < 0 || index > maxIndex) {
            throw new Error(`Constant index must be an integer between 0 and ${maxIndex}`);
        }
        const k = this.constants[index];
        return k.getValue(this.currentStep, this.skip === 1);
    }
    getNextValue(index) {
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
    setNextValue(index, value) {
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
}
exports.ProofFrame = ProofFrame;
//# sourceMappingURL=ProofFrame.js.map