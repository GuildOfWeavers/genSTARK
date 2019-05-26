// IMPORTS
// ================================================================================================
import { BatchMerkleProof } from '@guildofweavers/genstark';
import { MAX_ARRAY_LENGTH } from './sizeof';

// PUBLIC FUNCTIONS
// ================================================================================================
export function readMerkleProof(buffer: Buffer, offset: number, nodeSize: number) {

    const valuesInfo = readArray(buffer, offset, nodeSize); offset = valuesInfo.offset;
    const nodesInfo = readMatrix(buffer, offset, nodeSize); offset = nodesInfo.offset;
    const depth = buffer.readUInt8(offset); offset += 1;

    const proof: BatchMerkleProof = {
        values  : valuesInfo.values,
        nodes   : nodesInfo.matrix,
        depth   : depth
    };

    return { proof, offset };
}

export function readArray(buffer: Buffer, offset: number, elementSize: number) {

    const arrayLength = buffer.readUInt8(offset) || MAX_ARRAY_LENGTH;   // 0 means 256
    offset += 1;

    const values = new Array<Buffer>(arrayLength);
    for (let i = 0; i < arrayLength; i++) {
        values[i] = Buffer.allocUnsafe(elementSize);
        offset += buffer.copy(values[i], 0, offset, offset + elementSize);
    }

    return { values, offset };
}

export function readMatrix(buffer: Buffer, offset: number, elementSize: number) {

    const columnCount = buffer.readUInt8(offset) || MAX_ARRAY_LENGTH;   // 0 means 256
    offset += 1;

    const matrix = new Array<Buffer[]>(columnCount);
    for (let i = 0; i < columnCount; i++, offset += 1) {
        matrix[i] = new Array<Buffer>(buffer.readUInt8(offset));
    }

    for (let i = 0; i < columnCount; i++) {
        let column = matrix[i];
        for (let j = 0; j < column.length; j++) {
            column[j] = Buffer.allocUnsafe(elementSize);
            offset += buffer.copy(column[j], 0, offset, offset + elementSize);
        }
    }

    return { matrix, offset };
}