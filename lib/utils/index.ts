// IMPORTS
// ================================================================================================
import * as inliners from './inliners';
import { Vector } from '@guildofweavers/galois';

// RE-EXPORTS
// ================================================================================================
export { writeMerkleProof, readMerkleProof, writeMatrix, readMatrix, writeArray, readArray } from './serialization';
export { sizeOf } from './sizeof';
export { Logger } from './Logger';
export const inline = inliners;

// PUBLIC FUNCTIONS
// ================================================================================================
export function isPowerOf2(value: number | bigint): boolean {
    if (typeof value === 'bigint') {
        return (value !== 0n) && (value & (value - 1n)) === 0n;
    }
    else {
        return (value !== 0) && (value & (value - 1)) === 0;
    }
}

export function vectorToBuffers(values: Vector, size: number): Buffer[] {
    const result = new Array<Buffer>(values.length);
    if (values.elementSize > size) {
        throw Error('Cannot convert vector to buffer: vector elements are too large');
    }

    for (let i = 0; i < values.length; i++) {
        let buffer = Buffer.alloc(size);
        values.copyValue(i, buffer, 0);
        result[i] = buffer;
    }
    return result;
}

export function buffersToBigInts(values: Buffer[]): bigint[] {
    const result = new Array<bigint>(values.length);
    for (let i = 0; i < values.length; i++) {
        let buffer = values[i];
        result[i] = readBigInt(buffer, 0, buffer.byteLength);
    }
    return result;
}

export function readBigInt(buffer: Buffer, offset: number, elementSize: number): bigint {
    const blocks = elementSize >> 3;
    let value = 0n;
    for (let i = 0n; i < blocks; i++) {
        value = (buffer.readBigUInt64LE(offset) << (64n * i)) | value;
        offset += 8;
    }
    return value;
}