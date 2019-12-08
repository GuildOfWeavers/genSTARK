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
    size += evProof.total;

    // ldProof
    let ldProof = 1; // ld component count

    const lcProof = sizeOfMerkleProof(proof.ldProof.lcProof);
    ldProof += lcProof.total + hashDigestSize; // + lc root

    const ldLevels: any[] = [];
    for (let component of proof.ldProof.components) {
        ldProof += hashDigestSize; // column root
        let column = sizeOfMerkleProof(component.columnProof);
        ldProof += column.total;

        let poly = sizeOfMerkleProof(component.polyProof);
        ldProof += poly.total;

        ldLevels.push({ column, poly, total: column.total + poly.total + hashDigestSize });
    }
    let ldRemainder = proof.ldProof.remainder.length * fieldElementSize;
    ldRemainder += 1; // 1 byte for remainder length

    ldLevels.push({ total: ldRemainder });
    ldProof += ldRemainder;
    size += ldProof;

    // input shapes
    let inputShapes = 1; // input count
    for (let i = 0; i < proof.iShapes.length; i++) {
        inputShapes += 1; // rank
        inputShapes += proof.iShapes[i].length * 4;
    }
    size += inputShapes;

    return { evProof, ldProof: { lcProof, levels: ldLevels, total: ldProof }, inputShapes, total: size };
}

export function sizeOfMerkleProof(proof: BatchMerkleProof) {
    const values = sizeOfArray(proof.values);
    const nodes = sizeOfMatrix(proof.nodes);
    return { values, nodes, total: values + nodes + 1 }; // +1 for tree depth
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