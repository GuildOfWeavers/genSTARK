declare module '@guildofweavers/genstark' {

    // IMPORTS AND RE-EXPORTS
    // --------------------------------------------------------------------------------------------
    import { FiniteField } from '@guildofweavers/galois';
    export { FiniteField, PrimeField, Polynom } from '@guildofweavers/galois';

    import { BatchMerkleProof, HashAlgorithm } from '@guildofweavers/merkle';
    export { MerkleTree, BatchMerkleProof, HashAlgorithm, getHashDigestSize } from '@guildofweavers/merkle';

    // STARK
    // --------------------------------------------------------------------------------------------
    export interface StarkConfig {
        field               : FiniteField;
        registerCount       : number;
        constantCount?      : number;
        tFunction           : TransitionFunction;
        tConstraints        : TransitionConstraint[];
        tConstraintDegree   : number;
        extensionFactor?    : number;
        exeSpotCheckCount?  : number;
        friSpotCheckCount?  : number;

        hashAlgorithm?      : HashAlgorithm;
        logger?             : Logger;
    }

    export class Stark {
        constructor(config: StarkConfig);

        prove(assertions: Assertion[], steps: number, inputs: bigint[], constants?: Constant[]): StarkProof;
        verify(assertions: Assertion[], proof: StarkProof, steps: number, constants?: Constant[]): boolean;

        sizeOf(proof: StarkProof): number;
        serialize(proof: StarkProof): Buffer;
        parse(proof: Buffer): StarkProof;
    }

    export interface StarkProof {
        evaluations: {
            root    : Buffer;
            values  : Buffer[];
            nodes   : Buffer[][];
            depth   : number;
            bpc     : number;
        };
        degree: {
            root    : Buffer;
            lcProof : BatchMerkleProof;
            ldProof : LowDegreeProof;
        }
    }

    // CONSTRAINTS
    // --------------------------------------------------------------------------------------------
    export interface Assertion {
        step    : number;
        register: number;
        value   : bigint;
    }

    export interface TransitionFunction {
        (frame: ExecutionFrame, field: FiniteField): void;
    }

    export interface TransitionConstraint {
        (frame: EvaluationFrame, field: FiniteField): bigint;
    }

    // FRAMES
    // --------------------------------------------------------------------------------------------
    export interface ExecutionFrame {
        getValue(index: number): bigint;
        getConst(index: number): bigint;

        setNextValue(index: number, value: bigint): void;
    }

    export interface EvaluationFrame {
        getValue(index: number): bigint;
        getConst(index: number): bigint;

        getNextValue(index: number): bigint;
    }

    export interface Constant {
        values  : bigint[];
        pattern : ConstantPattern;
    }

    export const enum ConstantPattern {
        repeat = 1, stretch = 2
    }

    // LOW DEGREE PROOF
    // --------------------------------------------------------------------------------------------
    export interface LowDegreeProof {
        components  : FriComponent[];
        remainder   : Buffer[];
    }
    
    export interface FriComponent {
        columnRoot  : Buffer;
        columnProof : BatchMerkleProof;
        polyProof   : BatchMerkleProof;
    }

    // INTERNAL
    // --------------------------------------------------------------------------------------------
    export interface EvaluationContext {
        field           : FiniteField;
        steps           : number;
        extensionFactor : number;
        rootOfUnity     : bigint;
        registerCount   : number;
        constantCount   : number;
        hashAlgorithm   : HashAlgorithm;
    }

    export interface ReadonlyRegister {
        getValue(step: number, skip: boolean): bigint;
        getValueAt(x: bigint): bigint;
    }

    export interface Logger {
        start(message?: string) : symbol;
        log(label: symbol, message: string): void;
        done(label: symbol, message?: string): void;
    }
}