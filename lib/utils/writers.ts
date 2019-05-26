// IMPORTS
// ================================================================================================
import { BatchMerkleProof } from '@guildofweavers/genstark';
import { MAX_ARRAY_LENGTH } from './sizeof';

// PUBLIC FUNCTIONS
// ================================================================================================
export function writeMerkleProof(buffer: Buffer, offset: number, proof: BatchMerkleProof, nodeSize: number): number {
    offset = writeArray(buffer, offset, proof.values);
    offset = writeMatrix(buffer, offset, proof.nodes);
    offset = buffer.writeUInt8(proof.depth, offset);
    return offset;
}

export function writeArray(buffer: Buffer, offset: number, array: Buffer[]) {

    // 1 byte for the array size (max 256 is written as 0)
    offset = buffer.writeUInt8(array.length === MAX_ARRAY_LENGTH ? 0 : array.length, offset);

    for (let i = 0; i < array.length; i++) {
        offset += array[i].copy(buffer, offset);
    }

    return offset;
}

export function writeMatrix(buffer: Buffer, offset: number, matrix: Buffer[][]): number {

    // 1 byte for the number of columns (max 256 written as 0)
    offset = buffer.writeUInt8(matrix.length === MAX_ARRAY_LENGTH ? 0 : matrix.length, offset);

    // then write lengths of each column (1 byte each, max 255)
    for (let i = 0; i < matrix.length; i++) {
        offset = buffer.writeUInt8(matrix[i].length, offset);
    }

    // then write the actual values
    for (let i = 0; i < matrix.length; i++) {
        let column = matrix[i];
        for (let j = 0; j < column.length; j++) {
            offset += column[j].copy(buffer, offset);
        }
    }

    return offset;
}