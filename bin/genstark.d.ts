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
    export interface SecurityOptions {

        /** Execution trace extension factor; defaults to the smallest power of 2 greater than 2x of max constraint degree */
        extensionFactor: number;

        /** Number of spot checks for the execution trace; defaults to 80 */
        exeSpotCheckCount: number;

        /** Number of spot checks for low degree proof; defaults to 40 */
        friSpotCheckCount: number;

        /** Hash algorithm for Merkle trees; defaults to sha256 */
        hashAlgorithm: HashAlgorithm;
    }

    export class Stark {

        /**
         * Creates a STARK instance based on the provided parameters
         * @param source AirScript source for the STARK
         * @param options Security options for the STARK instance
         * @param logger Optional logger; defaults to console logging; set to null to disable
         */
        constructor(source: string, options?: Partial<SecurityOptions>, logger?: Logger);

        /**
         * Generate a proof of computation for this STARK
         * @param assertions Boundary constraints for the computation
         * @param inputs Initial values for all mutable registers
         */
        prove(assertions: Assertion[], inputs: bigint[]): StarkProof;

        /**
         * Verifies a proof of computation for this STARK
         * @param assertions Boundary constraints for the computation
         * @param proof Proof of the computation
         * @param iterations Number of iterations of the computation; the default is 1
         */
        verify(assertions: Assertion[], proof: StarkProof, iterations?: number): boolean;

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

    export interface StarkProof2 {
        values      : Buffer[];
        evProof: {
            root    : Buffer;
            nodes   : Buffer[][];
            depth   : number;
        };
        lcProof: {
            root    : Buffer;
            nodes   : Buffer[][];
            depth   : number;
        };
        ldProof     : LowDegreeProof;
    }

    // CONSTRAINTS
    // --------------------------------------------------------------------------------------------
    export interface Assertion {
        /** index of a mutable register */
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

    // UTILITIES
    // --------------------------------------------------------------------------------------------
    export const inline: { 
        vector(v: bigint[]): string;
        matrix(m: bigint[][]): string;
    };

    // INTERNAL
    // --------------------------------------------------------------------------------------------
    export interface EvaluationContext {
        readonly field              : FiniteField;
        readonly constraintDegree   : number;
        readonly roundSteps         : number;
        readonly totalSteps         : number;
        readonly domainSize         : number;
        readonly rootOfUnity        : bigint;
        readonly registerCount      : number;
        readonly constantCount      : number;
        readonly hashAlgorithm      : HashAlgorithm;
    }

    export interface ComputedRegister {
        getValue(step: number, skip: boolean): bigint;
        getValueAt(x: bigint): bigint;
    }

    export interface Logger {
        start(message?: string) : symbol;
        log(label: symbol, message: string): void;
        done(label: symbol, message?: string): void;
    }
}