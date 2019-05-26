// IMPORTS
// ================================================================================================
import { EvaluationFrame, ReadonlyRegister } from '@guildofweavers/genstark';

// CLASS DEFINITION
// ================================================================================================
export class VerificationFrame implements EvaluationFrame {

    readonly registerCount! : number;
    
    readonly skip           : number;
    readonly values         : Map<number, bigint[]>;
    readonly constants      : ReadonlyRegister[];
    readonly domainSize     : number

    currentStep             : number;
    currentX                : bigint;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(domainSize: number, pEvaluations: Map<number, bigint[]>, constants: ReadonlyRegister[], skip: number) {
        
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
    getValue(index: number): bigint {
        const maxIndex = this.registerCount - 1;
        if (index < 0 || index > maxIndex) {
            throw new TypeError(`Register index must be an integer between 0 and ${maxIndex}`);
        }
        return this.values.get(this.currentStep)![index];
    }

    getConst(index: number): bigint {
        const maxIndex = this.constants.length - 1;
        if (index < 0 || index > maxIndex) {
            throw new Error(`Constant index must be an integer between 0 and ${maxIndex}`);
        }

        const k = this.constants[index];
        return k.getValueAt(this.currentX);
    }

    getNextValue(index: number): bigint {
        const maxIndex = this.registerCount - 1;
        if (index < 0 || index > maxIndex) {
            throw new TypeError(`Register index must be an integer between 0 and ${maxIndex}`);
        }

        const step = (this.currentStep + this.skip) % this.domainSize;
        const p = this.values.get(step)![index];
        return p;
    }
}