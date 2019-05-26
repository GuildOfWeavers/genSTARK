// IMPORTS
// ================================================================================================
import { StarkProof, BatchMerkleProof, HashAlgorithm } from '@guildofweavers/genstark';
import { getHashDigestSize } from '@guildofweavers/merkle';

// MODULE VARIABLES
// ================================================================================================
export const MAX_ARRAY_LENGTH = 256;

// PUBLIC FUNCTIONS
// ================================================================================================
export function sizeOf(proof: StarkProof, valueSize: number, hashAlgorithm: HashAlgorithm) {

    const nodeSize = getHashDigestSize(hashAlgorithm);

    let size = 0;
    
    // evaluations
    size += nodeSize; // root
    const evData = sizeOfArray(proof.evaluations.values, valueSize);
    const evProof = sizeOfMatrix(proof.evaluations.nodes, nodeSize);
    size += 1; // evaluation proof depth
    size += 1; // boundary poly count
    size += evData + evProof;

    // degree
    size += nodeSize; // root
    const lcProof = sizeOfMerkleProof(proof.degree.lcProof, nodeSize);
    let ldProof = 1; // ld component count
    for (let i = 0; i < proof.degree.ldProof.components.length; i++) {
        let component = proof.degree.ldProof.components[i];
        ldProof += nodeSize; // column root
        ldProof += sizeOfMerkleProof(component.columnProof, nodeSize);
        ldProof += sizeOfMerkleProof(component.polyProof, nodeSize);
    }
    ldProof += sizeOfArray(proof.degree.ldProof.remainder, nodeSize);
    size += lcProof + ldProof;

    return { evData, evProof, lcProof, ldProof, total: size };
}

export function sizeOfMerkleProof(proof: BatchMerkleProof, nodeSize: number) {
    let size = 0;
    size += sizeOfArray(proof.values, nodeSize);
    size += sizeOfMatrix(proof.nodes, nodeSize);
    size += 1; // tree depth
    return size;
}

// HELPER FUNCTIONS
// ================================================================================================
function sizeOfArray(array: any[], elementSize: number): number {
    if (array.length > MAX_ARRAY_LENGTH) {
        throw new Error(`Array length (${array.length}) cannot exceed ${MAX_ARRAY_LENGTH}`);
    }

    let size = 1; // 1 byte for array length
    size += array.length * elementSize;
    return size;
}

function sizeOfMatrix(matrix: any[][], elementSize: number): number {

    if (matrix.length > MAX_ARRAY_LENGTH) {
        throw new Error(`Matrix column count (${matrix.length}) cannot exceed ${MAX_ARRAY_LENGTH}`);
    }

    let size = 1;           // 1 byte for number of columns
    size += matrix.length;  // 1 byte for length of each column

    for (let i = 0; i < matrix.length; i++) {
        let columnLength = matrix[i].length;
        if (columnLength >= MAX_ARRAY_LENGTH) {
            throw new Error(`Matrix column length (${columnLength}) cannot exceed ${MAX_ARRAY_LENGTH - 1}`);
        }
        size += (columnLength * elementSize);
    }

    return size;
}