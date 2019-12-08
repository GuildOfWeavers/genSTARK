declare module '@guildofweavers/genstark' {

    // IMPORTS
    // --------------------------------------------------------------------------------------------
    import { AirModule, FiniteField } from '@guildofweavers/air-assembly';
    import { Hash, HashAlgorithm, BatchMerkleProof } from '@guildofweavers/merkle';

    // RE-EXPORTS
    // --------------------------------------------------------------------------------------------
    export { FiniteField, createPrimeField, Vector, Matrix } from '@guildofweavers/galois';
    export { MerkleTree, BatchMerkleProof, HashAlgorithm, createHash, Hash } from '@guildofweavers/merkle';

    // PUBLIC FUNCTIONS
    // --------------------------------------------------------------------------------------------
    export function createStark(source: Buffer | string, options?: Partial<StarkOptions>, useWasm?: boolean, logger?: Logger): Stark;

    // STARK
    // --------------------------------------------------------------------------------------------
    export interface StarkOptions {

        /**
         * Execution trace extension factor; defaults to the smallest power of 2 greater than 2x
         * of the highest constraint degree
         */
        extensionFactor: number;

        /** Number of queries for the execution trace; defaults to 80 */
        exeQueryCount: number;

        /** Number of queries for low degree proof; defaults to 40 */
        friQueryCount: number;

        /** Hash algorithm for Merkle trees; defaults to sha256 */
        hashAlgorithm: HashAlgorithm;
    }

    export class Stark {

        /** Estimated security level of the STARK (experimental) */
        readonly securityLevel: number;

        /**
         * Creates a STARK instance based on the provided parameters
         * @param air TODO
         * @param options Security options for the STARK instance
         * @param logger Optional logger; defaults to console logging; set to null to disable
         */
        constructor(air: AirModule, options: StarkOptions, logger?: Logger);

        /**
         * Generate a proof of computation for this STARK
         * @param assertions Boundary constraints for the computation
         * @param inputs TODO
         * @param seed TODO
         */
        prove(assertions: Assertion[], inputs: any[], seed?: bigint[]): StarkProof;

        /**
         * Verifies a proof of computation for this STARK
         * @param assertions Boundary constraints for the computation
         * @param proof Proof of the computation
         * @param publicInputs TODO
         */
        verify(assertions: Assertion[], proof: StarkProof, publicInputs?: any[]): boolean;

        /** Returns the size in bytes for the provided proof */
        sizeOf(proof: StarkProof): number;

        /** Writes the proof to a buffer */
        serialize(proof: StarkProof): Buffer;

        /** Reads a proof from the provided buffer */
        parse(proof: Buffer): StarkProof;
    }

    export interface StarkProof {
        evRoot  : Buffer;
        evProof : BatchMerkleProof;
        ldProof : LowDegreeProof;
        iShapes : number[][];
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
        lcRoot      : Buffer;
        lcProof     : BatchMerkleProof,
        components  : FriComponent[];
        remainder   : bigint[];
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
        start(message?: string, prefix?: string) : LogFunction;
        sub(message?: string): LogFunction;
        done(log: LogFunction, message?: string): void;
    }

    export type LogFunction = (message: string) => void;
}