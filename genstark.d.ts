declare module '@guildofweavers/genstark' {

    // IMPORTS
    // --------------------------------------------------------------------------------------------
    import { FiniteField } from '@guildofweavers/air-script';
    import { BatchMerkleProof, HashAlgorithm } from '@guildofweavers/merkle';

    // RE-EXPORTS
    // --------------------------------------------------------------------------------------------
    export { FiniteField, PrimeField, Polynom } from '@guildofweavers/galois';
    export { MerkleTree, BatchMerkleProof, HashAlgorithm, getHashDigestSize } from '@guildofweavers/merkle';

    // STARK
    // --------------------------------------------------------------------------------------------
    export interface SecurityOptions {

        /** Execution trace extension factor; defaults to the smallest power of 2 greater than 2x of max constraint degree */
        extensionFactor?: number;

        /** Number of queries for the execution trace; defaults to 80 */
        exeQueryCount: number;

        /** Number of queries for low degree proof; defaults to 40 */
        friQueryCount: number;

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
         * @param initValues An array containing initial values for all mutable registers
         * @param publicInputs An array containing values for all specified public registers
         * @param secretInputs An array containing values for all specified secret registers
         */
        prove(assertions: Assertion[], initValues: bigint[], publicInputs?: bigint[][], secretInputs?: bigint[][]): StarkProof;

        /**
         * Verifies a proof of computation for this STARK
         * @param assertions Boundary constraints for the computation
         * @param proof Proof of the computation
         * @param publicInputs An array containing values for all specified public registers
         */
        verify(assertions: Assertion[], proof: StarkProof, publicInputs?: bigint[][]): boolean;

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

    export interface Logger {
        start(message?: string) : symbol;
        log(label: symbol, message: string): void;
        done(label: symbol, message?: string): void;
    }
}