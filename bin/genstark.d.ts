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
        field               : FiniteField;
        constantCount?      : number;
        tFunction           : { [register: string]: string };
        tConstraints        : string[];
        tConstraintDegree   : number;
        extensionFactor?    : number;
        exeSpotCheckCount?  : number;
        friSpotCheckCount?  : number;
        hashAlgorithm?      : HashAlgorithm;
    }

    export class Stark {

        /** Create a STARK based on the provided config parameters */
        constructor(config: StarkConfig, logger?: Logger);

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

    export interface TransitionFunction {
        (r: bigint[][], k: ReadonlyRegister[], steps: number, field: FiniteField): void;
    }

    export interface TransitionConstraints {
        (q: bigint[][], r: bigint[][], k: ReadonlyRegister[], steps: number, skip: number, field: FiniteField): void;
    }

    export interface ConstraintEvaluator {
        (r: bigint[], n: bigint[], k: bigint[], field: FiniteField): bigint[];
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