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
        step    : number;
        register: number;
        value   : bigint;
    }

    export interface TransitionFunction {
        (frame: ExecutionFrame): void;
    }

    export interface TransitionConstraint {
        (frame: EvaluationFrame): bigint;
    }

    // FRAMES
    // --------------------------------------------------------------------------------------------
    export interface ExecutionFrame extends FrameOps {
        getValue(index: number): bigint;
        getConst(index: number): bigint;

        setNextValue(index: number, value: bigint): void;
    }

    export interface EvaluationFrame extends FrameOps {
        getValue(index: number): bigint;
        getConst(index: number): bigint;

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