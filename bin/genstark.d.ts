declare module '@guildofweavers/genstark' {

    // IMPORTS
    // --------------------------------------------------------------------------------------------
    import { FiniteField } from '@guildofweavers/galois';
    import { BatchMerkleProof, HashAlgorithm } from '@guildofweavers/merkle';

    // RE-EXPORTS
    // --------------------------------------------------------------------------------------------
    export { FiniteField, PrimeField, Polynom } from '@guildofweavers/galois';
    export { MerkleTree, BatchMerkleProof, HashAlgorithm, getHashDigestSize } from '@guildofweavers/merkle';

    // STARK
    // --------------------------------------------------------------------------------------------
    export interface StarkConfig {
        /** field for all math operations in the computation */
        field: FiniteField;

        /** Number of mutable registers in the computation */
        registerCount: number;

        /** Number of  readonly registers in the computation */
        constantCount?: number;

        /** State transition function for the computation */
        tFunction: TransitionFunction;

        /** A list of transition constraints for the computation */
        tConstraints: TransitionConstraint[];

        /** Maximum degree of transition constraints */
        tConstraintDegree: number;

        /** Execution trace extension factor; defaults to 8 */
        extensionFactor?: number;

        /** Number of spot checks for the execution trace; defaults to 80 */
        exeSpotCheckCount?  : number;

        /** Number of spot checks for low degree proof; defaults to 40 */
        friSpotCheckCount?  : number;

        /** Hash algorithm for Merkle trees; defaults to sha256 */
        hashAlgorithm?: HashAlgorithm;

        /** Logger for tracking proof / verification processes */
        logger?: Logger;
    }

    export class Stark {

        /** Create a STARK based on the provided config parameters */
        constructor(config: StarkConfig);

        /**
         * Generate a proof of computation for this STARK
         * @param assertions Boundary constraints for the computation
         * @param steps Number of steps in the computation
         * @param inputs Initial values for all mutable registers
         * @param constants Definitions for all readonly registers
         */
        prove(assertions: Assertion[], steps: number, inputs: bigint[], constants?: Constant[]): StarkProof;

        /**
         * Verifies a proof of computation for this STARK
         * @param assertions Boundary constraints for the computation
         * @param proof Proof of the computation
         * @param steps Number of steps in the computation
         * @param constants Definitions for readonly registers
         */
        verify(assertions: Assertion[], proof: StarkProof, steps: number, constants?: Constant[]): boolean;

        /** Returns the size in bytes for the provided proof */
        sizeOf(proof: StarkProof): number;

        /** Writes the proof to a buffer */
        serialize(proof: StarkProof): Buffer;

        /** Reads a proof from the provided buffer */
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

    export interface Constant {
        values  : bigint[];
        pattern : ConstantPattern;
    }

    export const enum ConstantPattern {
        repeat = 1,
        stretch = 2
    }

    // CONSTRAINTS
    // --------------------------------------------------------------------------------------------
    export interface Assertion {
        /** register index */
        register: number;

        /** step in the execution trace */
        step: number;

        /** value that the register should have at the specified step */
        value: bigint;
    }

    export interface TransitionFunction {
        (this: ExecutionFrame): void;
    }

    export interface TransitionConstraint {
        (this: EvaluationFrame): bigint;
    }

    // FRAMES
    // --------------------------------------------------------------------------------------------
    export interface ExecutionFrame extends FrameOps {
        /** Get the current value from a mutable register specified by the index */
        getValue(index: number): bigint;

        /** Get the current value from a readonly register specified by the index  */
        getConst(index: number): bigint;

        /** Set the next value for a mutable register specified by the index */
        setNextValue(index: number, value: bigint): void;
    }

    export interface EvaluationFrame extends FrameOps {
        /** Get the current value from a mutable register specified by the index */
        getValue(index: number): bigint;

        /** Get the current value from a readonly register specified by the index  */
        getConst(index: number): bigint;

        /** Get the next value from a mutable register specified by the index */
        getNextValue(index: number): bigint;
    }

    interface FrameOps {
        add(a: bigint, b: bigint): bigint;
        sub(a: bigint, b: bigint): bigint;
        mul(a: bigint, b: bigint): bigint;
        div(a: bigint, b: bigint): bigint;
        exp(b: bigint, p: bigint): bigint;
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