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

// MATH
// ================================================================================================
export function isPowerOf2(value: number | bigint): boolean {
    if (typeof value === 'bigint') {
        return (value !== 0n) && (value & (value - 1n)) === 0n;
    }
    else {
        return (value !== 0) && (value & (value - 1)) === 0;
    }
}
export function powLog2(base: number, exponent: number): number {
    let twos = 0;
    while (exponent % 2 === 0) {
        twos++;
        exponent = exponent / 2;
    }
    return (2**twos) * Math.log2(base**exponent);
}

// BIGINT-BUFFER CONVERSIONS
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

// OTHER
// ================================================================================================
export function noop() {};