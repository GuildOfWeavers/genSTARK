declare module '@guildofweavers/genstark' {

    // IMPORTS
    // --------------------------------------------------------------------------------------------
    import { AirSchema, FiniteField } from '@guildofweavers/air-assembly';
    import { Hash, HashAlgorithm, BatchMerkleProof } from '@guildofweavers/merkle';

    // RE-EXPORTS
    // --------------------------------------------------------------------------------------------
    export { FiniteField, createPrimeField, Vector, Matrix } from '@guildofweavers/galois';
    export { MerkleTree, BatchMerkleProof, HashAlgorithm, createHash, Hash } from '@guildofweavers/merkle';

    // PUBLIC FUNCTIONS
    // --------------------------------------------------------------------------------------------

    /**
     * Creates an instance of STARK object based on the provided AirAssembly schema.
     * @param schema AirAssembly schema from which the STARK object is to be built.
     * @param component Name of the component from which to instantiate STARK. If omitted 'default` will be used.
     * @param options Security and optimization options for STARK instance.
     * @param logger Optional logger; defaults to console logging; set to null to disable.
     */
    export function instantiate(schema: AirSchema, component: string, options?: Partial<StarkOptions>, logger?: Logger | null): Stark;

    /**
     * Creates an instance of STARK object from the provided AirAssembly source code.
     * @param source AirAssembly source code from which the STARK object is to be built.
     * @param component Name of the component from which to instantiate STARK. If omitted 'default` will be used.
     * @param options Security and optimization options for STARK instance.
     * @param logger Optional logger; defaults to console logging; set to null to disable.
     */
    export function instantiate(source: Buffer, component: string, options?: Partial<StarkOptions>, logger?: Logger | null): Stark;

    /**
     * Creates an instance of STARK object from the specified AirAssembly file.
     * @param path Path to a file containing AirAssembly source code from which the STARK object is to be built.
     * @param component Name of the component from which to instantiate STARK. If omitted 'default` will be used.
     * @param options Security and optimization options for STARK instance.
     * @param logger Optional logger; defaults to console logging; set to null to disable.
     */
    export function instantiate(path: string, component: string, options?: Partial<StarkOptions>, logger?: Logger | null): Stark;

    /**
     * Creates an instance of STARK object from the provided AirScript source code.
     * @param source AirScript source code from which the STARK object is to be built.
     * @param options Security and optimization options for STARK instance.
     * @param logger Optional logger; defaults to console logging; set to null to disable.
     */
    export function instantiateScript(source: Buffer, options?: Partial<StarkOptions>, logger?: Logger): Stark;

    /**
     * Creates an instance of STARK object from the specified AirAssembly file.
     * @param path Path to a file containing AirScript source code from which the STARK object is to be built.
     * @param component Name of the component from which to instantiate STARK. If omitted 'default` will be used.
     * @param logger Optional logger; defaults to console logging; set to null to disable.
     */
    export function instantiateScript(path: string, options?: Partial<StarkOptions>, logger?: Logger): Stark;

    // STARK
    // --------------------------------------------------------------------------------------------
    export interface StarkOptions extends SecurityOptions {

        /** A flag indicating whether to use WebAssembly optimizations; defaults to true */
        readonly wasm: boolean;
    }

    export interface SecurityOptions {
        /**
         * Execution trace extension factor; defaults to the smallest power of 2 greater than 2x
         * of the highest constraint degree
         */
        readonly extensionFactor: number;

        /** Number of queries for the execution trace; defaults to 80 */
        readonly exeQueryCount: number;

        /** Number of queries for low degree proof; defaults to 40 */
        readonly friQueryCount: number;

        /** Hash algorithm for Merkle trees; defaults to sha256 */
        readonly hashAlgorithm: HashAlgorithm;
    }

    export interface Stark {

        /** Estimated security level of the STARK (experimental) */
        readonly securityLevel: number;

        /**
         * Generate a proof of computation for this STARK.
         * @param assertions Boundary constraints for the computation.
         * @param inputs Values for initializing all declared input.
         * @param seed Seed values for initializing execution trace.
         */
        prove(assertions: Assertion[], inputs?: any[], seed?: bigint[]): StarkProof;

        /**
         * Verifies a proof of computation for this STARK.
         * @param assertions Boundary constraints for the computation.
         * @param proof Proof of the computation.
         * @param publicInputs Values for initializing declared public inputs.
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