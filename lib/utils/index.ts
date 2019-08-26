// IMPORTS
// ================================================================================================
import * as inliners from './inliners';

// RE-EXPORTS
// ================================================================================================
export { writeMerkleProof, readMerkleProof, writeMatrix, readMatrix, writeArray, readArray } from './serialization';
export { sizeOf } from './sizeof';
export { Logger } from './Logger';
export const inline = inliners;

// CONSTANTS
// ================================================================================================
const MASK_64B = 0xFFFFFFFFFFFFFFFFn;

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

export function buffersToBigInts(values: Buffer[]): bigint[] {
    const result = new Array<bigint>(values.length);
    for (let i = 0; i < values.length; i++) {
        let buffer = values[i];
        result[i] = readBigInt(buffer, 0, buffer.byteLength);
    }
    return result;
}

export function bigIntsToBuffers(values: bigint[], size: number): Buffer[] {
    const result = new Array<Buffer>(values.length);
    const limbCount = size >> 3;
    for (let i = 0; i < result.length; i++) {
        let offset = 0, value = values[i], buffer = Buffer.allocUnsafe(size);
        for (let limb = 0; limb < limbCount; limb++, offset += 8) {
            buffer.writeBigUInt64LE(value & MASK_64B, offset);
            value = value >> 64n;
        }
        result[i] = buffer;
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

export function powLog2(base: number, exponent: number): number {
    let twos = 0;
    while (exponent % 2 === 0) {
        twos++;
        exponent = exponent / 2;
    }
    return (2**twos) * Math.log2(base**exponent);
}

export function noop() {};