"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// CLASS DEFINITION
// ================================================================================================
class VerificationFrame {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(field, domainSize, pEvaluations, constants, skip) {
        this.field = field;
        this.domainSize = domainSize;
        this.values = pEvaluations;
        this.constants = constants;
        this.skip = skip;
        // determine register count
        for (let evaluations of pEvaluations.values()) {
            this.registerCount = evaluations.length;
            break;
        }
        this.currentStep = 0;
        this.currentX = 0n;
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    getValue(index) {
        const maxIndex = this.registerCount - 1;
        if (index < 0 || index > maxIndex) {
            if (maxIndex === 0) {
                throw new Error(`You have only 1 register defined; the index must be equal to 0`);
            }
            else {
                throw new Error(`Register index must be an integer between 0 and ${maxIndex}`);
            }
        }
        return this.values.get(this.currentStep)[index];
    }
    getConst(index) {
        const maxIndex = this.constants.length - 1;
        if (index < 0 || index > maxIndex) {
            if (maxIndex === 0) {
                throw new Error(`You have only 1 constant defined; the index must be equal to 0`);
            }
            else if (maxIndex === -1) {
                throw new Error(`You don't have any constants defined`);
            }
            else {
                throw new Error(`Constant index must be an integer between 0 and ${maxIndex}`);
            }
        }
        const k = this.constants[index];
        return k.getValueAt(this.currentX);
    }
    getNextValue(index) {
        const maxIndex = this.registerCount - 1;
        if (index < 0 || index > maxIndex) {
            if (maxIndex === 0) {
                throw new Error(`You have only 1 register defined; the index must be equal to 0`);
            }
            else {
                throw new Error(`Register index must be an integer between 0 and ${maxIndex}`);
            }
        }
        const step = (this.currentStep + this.skip) % this.domainSize;
        const p = this.values.get(step)[index];
        return p;
    }
    // MATH OPERATIONS
    // --------------------------------------------------------------------------------------------
    add(a, b) {
        return this.field.add(a, b);
    }
    sub(a, b) {
        return this.field.sub(a, b);
    }
    mul(a, b) {
        return this.field.mul(a, b);
    }
    div(a, b) {
        return this.field.div(a, b);
    }
    exp(a, b) {
        return this.field.exp(a, b);
    }
}
exports.VerificationFrame = VerificationFrame;
//# sourceMappingURL=VerificationFrame.js.map