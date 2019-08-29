// IMPORTS
// ================================================================================================
import { BatchMerkleProof } from '@guildofweavers/genstark';
import { MAX_ARRAY_LENGTH } from './sizeof';

// MODULE VARIABLES
// ================================================================================================
const MASK_64B = 0xFFFFFFFFFFFFFFFFn;

// INTERFACES
// ================================================================================================
const enum ColumnType {
    node = 0, leaf = 1
}

// MERKLE PROOFS
// ================================================================================================
export function writeMerkleProof(buffer: Buffer, offset: number, proof: BatchMerkleProof, leafSize: number): number {
    offset = writeArray(buffer, offset, proof.values);
    offset = writeMatrix(buffer, offset, proof.nodes, leafSize);
    offset = buffer.writeUInt8(proof.depth, offset);
    return offset;
}

export function readMerkleProof(buffer: Buffer, offset: number, leafSize: number, nodeSize: number) {

    const valuesInfo = readArray(buffer, offset, leafSize); offset = valuesInfo.offset;
    const nodesInfo = readMatrix(buffer, offset, leafSize, nodeSize); offset = nodesInfo.offset;
    const depth = buffer.readUInt8(offset); offset += 1;

    const proof: BatchMerkleProof = {
        values  : valuesInfo.values,
        nodes   : nodesInfo.matrix,
        depth   : depth
    };

    return { proof, offset };
}

// ARRAYS
// ================================================================================================
export function writeArray(buffer: Buffer, offset: number, array: Buffer[]) {

    // 1 byte for the array size (max 256 is written as 0)
    offset = buffer.writeUInt8(array.length === MAX_ARRAY_LENGTH ? 0 : array.length, offset);

    for (let i = 0; i < array.length; i++) {
        offset += array[i].copy(buffer, offset);
    }

    return offset;
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

// MATRIXES
// ================================================================================================
export function writeMatrix(buffer: Buffer, offset: number, matrix: Buffer[][], leafSize: number): number {

    // 1 byte for the number of columns (max 256 written as 0)
    offset = buffer.writeUInt8(matrix.length === MAX_ARRAY_LENGTH ? 0 : matrix.length, offset);

    // then write lengths and value type of each column (1 byte each, max 255)
    for (let i = 0; i < matrix.length; i++) {
        let column = matrix[i];
        let length = column.length;

        // column type is stored as least significant bit
        let type = (length > 0 && column[0].byteLength === leafSize)
            ? ColumnType.leaf
            : ColumnType.node;
        offset = buffer.writeUInt8((length << 1) | type, offset);
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

export function readMatrix(buffer: Buffer, offset: number, leafSize: number, nodeSize: number) {

    const columnCount = buffer.readUInt8(offset) || MAX_ARRAY_LENGTH;   // 0 means 256
    offset += 1;

    const matrix = new Array<Buffer[]>(columnCount);
    const columnTypes = new Array<number>(columnCount);
    for (let i = 0; i < columnCount; i++, offset += 1) {
        let lengthAndType = buffer.readUInt8(offset);

        matrix[i] = new Array<Buffer>(lengthAndType >>> 1);
        columnTypes[i] = lengthAndType & 1;
    }

    let elementSize: number;
    for (let i = 0; i < columnCount; i++) {
        let column = matrix[i];

        // set first element type based on column type
        let firstElementSize = columnTypes[i] === ColumnType.leaf ? leafSize : nodeSize;

        for (let j = 0; j < column.length; j++) {
            elementSize = (j === 0) ? firstElementSize : nodeSize;
            column[j] = Buffer.allocUnsafe(elementSize);
            offset += buffer.copy(column[j], 0, offset, offset + elementSize);
        }
    }

    return { matrix, offset };
}

// BIG INTEGERS
// ================================================================================================
export function readBigInt(buffer: Buffer, offset: number, elementSize: number): bigint {
    const blocks = elementSize >> 3;
    let value = 0n;
    for (let i = 0n; i < blocks; i++) {
        value = (buffer.readBigUInt64LE(offset) << (64n * i)) | value;
        offset += 8;
    }
    return value;
}

export function writeBigInt(value: bigint, buffer: Buffer, offset: number, elementSize: number): number {
    const limbCount = elementSize >> 3;
    for (let i = 0; i < limbCount; i++) {
        buffer.writeBigUInt64LE(value & MASK_64B, offset);
        value = value >> 64n;
        offset += 8;
    }
    return offset;
}