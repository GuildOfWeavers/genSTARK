// IMPORTS
// ================================================================================================
import { StarkProof, BatchMerkleProof } from '@guildofweavers/genstark';

// MODULE VARIABLES
// ================================================================================================
export const MAX_ARRAY_LENGTH = 256;

// PUBLIC FUNCTIONS
// ================================================================================================
export function sizeOf(proof: StarkProof, hashDigestSize: number) {

    let size = 0;
    
    // evData
    let evData = 1; // length of values array
    for (let value of proof.values) {
        evData += value.byteLength;
    }
    size += evData;

    // evProof
    let evProof = hashDigestSize; // root
    evProof += sizeOfMatrix(proof.evProof.nodes, hashDigestSize);
    evProof += 1; // evaluation proof depth
    size += evProof;

    // lcProof
    let lcProof = hashDigestSize; // root;
    lcProof += sizeOfMatrix(proof.lcProof.nodes, hashDigestSize);
    lcProof += 1; // linear combination proof depth
    size += lcProof;

    // ldProof
    let ldProof = 1; // ld component count
    for (let i = 0; i < proof.ldProof.components.length; i++) {
        let component = proof.ldProof.components[i];
        ldProof += hashDigestSize; // column root
        ldProof += sizeOfMerkleProof(component.columnProof, hashDigestSize);
        ldProof += sizeOfMerkleProof(component.polyProof, hashDigestSize);
    }
    ldProof += sizeOfArray(proof.ldProof.remainder, hashDigestSize);
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

    let size = 1; // 1 byte for array length, TODO: change to 2 bytes
    size += array.length * elementSize;
    return size;
}

function sizeOfMatrix(matrix: any[][], elementSize: number): number {

    if (matrix.length > MAX_ARRAY_LENGTH) {
        throw new Error(`Matrix column count (${matrix.length}) cannot exceed ${MAX_ARRAY_LENGTH}`);
    }

    let size = 1;           // 1 byte for number of columns     TODO: change to 2 bytes
    size += matrix.length;  // 1 byte for length of each column TODO: change to 2 bytes

    for (let i = 0; i < matrix.length; i++) {
        let columnLength = matrix[i].length;
        if (columnLength >= MAX_ARRAY_LENGTH) {
            throw new Error(`Matrix column length (${columnLength}) cannot exceed ${MAX_ARRAY_LENGTH - 1}`);
        }
        size += (columnLength * elementSize);
    }

    return size;
}