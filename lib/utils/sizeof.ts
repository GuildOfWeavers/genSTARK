// IMPORTS
// ================================================================================================
import { StarkProof, BatchMerkleProof } from '@guildofweavers/genstark';

// MODULE VARIABLES
// ================================================================================================
export const MAX_ARRAY_LENGTH = 256;
export const MAX_MATRIX_COLUMN_LENGTH = 127;

// PUBLIC FUNCTIONS
// ================================================================================================
export function sizeOf(proof: StarkProof, fieldElementSize: number, hashDigestSize: number) {

    let size = hashDigestSize;  // evRoot
    
    // evProof
    let evProof = sizeOfMerkleProof(proof.evProof);
    size += evProof;

    // ldProof
    let ldProof = 1; // ld component count
    let lcProof = hashDigestSize; // lc root
    lcProof += sizeOfMerkleProof(proof.ldProof.lcProof);
    ldProof += lcProof;

    const ldLevels: number[] = [];
    for (let i = 0; i < proof.ldProof.components.length; i++) {
        let component = proof.ldProof.components[i];
        let ldLevel = hashDigestSize; // column root
        ldLevel += sizeOfMerkleProof(component.columnProof);
        ldLevel += sizeOfMerkleProof(component.polyProof);
        ldProof += ldLevel;
        ldLevels.push(ldLevel);
    }
    let ldRemainder = proof.ldProof.remainder.values.length * fieldElementSize;
    ldRemainder += 1; // 1 byte for remainder length

    ldLevels.push(ldRemainder);
    ldProof += ldRemainder;
    size += ldProof;

    return { evProof, ldProof: { lcProof, levels: ldLevels, total: ldProof }, total: size };
}

export function sizeOfMerkleProof(proof: BatchMerkleProof) {
    let size = 0;
    size += sizeOfArray(proof.values);
    size += sizeOfMatrix(proof.nodes);
    size += 1; // tree depth
    return size;
}

// HELPER FUNCTIONS
// ================================================================================================
function sizeOfArray(array: any[]): number {
    if (array.length === 0) {
        throw new Error(`Array cannot be zero-length`);
    }
    else if (array.length > MAX_ARRAY_LENGTH) {
        throw new Error(`Array length (${array.length}) cannot exceed ${MAX_ARRAY_LENGTH}`);
    }

    let size = 1; // 1 byte for array length
    for (let i = 0; i < array.length; i++) {
        size += array[i].length;
    }
    return size;
}

function sizeOfMatrix(matrix: any[][]): number {

    if (matrix.length > MAX_ARRAY_LENGTH) {
        throw new Error(`Matrix column count (${matrix.length}) cannot exceed ${MAX_ARRAY_LENGTH}`);
    }

    let size = 1;           // 1 byte for number of columns
    size += matrix.length;  // 1 byte for length and type of each column

    for (let i = 0; i < matrix.length; i++) {
        let column = matrix[i];
        let columnLength = column.length;
        if (columnLength >= MAX_MATRIX_COLUMN_LENGTH) {
            throw new Error(`Matrix column length (${columnLength}) cannot exceed ${MAX_MATRIX_COLUMN_LENGTH}`);
        }

        for (let j = 0; j < columnLength; j++) {
            size += column[j].length;
        }
    }

    return size;
}