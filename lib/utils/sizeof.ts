// IMPORTS
// ================================================================================================
import { StarkProof, BatchMerkleProof, HashAlgorithm } from '@guildofweavers/genstark';
import { getHashDigestSize } from '@guildofweavers/merkle';

// MODULE VARIABLES
// ================================================================================================
export const MAX_ARRAY_LENGTH = 256;

// PUBLIC FUNCTIONS
// ================================================================================================
export function sizeOf(proof: StarkProof, hashAlgorithm: HashAlgorithm) {

    const nodeSize = getHashDigestSize(hashAlgorithm);
    let size = 0;
    
    // evData
    let evData = 1; // length of values array
    for (let value of proof.values) {
        evData += value.byteLength;
    }
    size += evData;

    // evProof
    let evProof = nodeSize; // root
    evProof += sizeOfMatrix(proof.evProof.nodes, nodeSize);
    evProof += 1; // evaluation proof depth
    size += evProof;

    // lcProof
    let lcProof = nodeSize; // root;
    lcProof += sizeOfMatrix(proof.lcProof.nodes, nodeSize);
    lcProof += 1; // linear combination proof depth
    size += lcProof;

    // ldProof
    let ldProof = 1; // ld component count
    for (let i = 0; i < proof.ldProof.components.length; i++) {
        let component = proof.ldProof.components[i];
        ldProof += nodeSize; // column root
        ldProof += sizeOfMerkleProof(component.columnProof, nodeSize);
        ldProof += sizeOfMerkleProof(component.polyProof, nodeSize);
    }
    ldProof += sizeOfArray(proof.ldProof.remainder, nodeSize);
    size += ldProof;

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