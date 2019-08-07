// IMPORTS
// ================================================================================================
import * as crypto from 'crypto';
import * as inliners from './inliners';
import { Vector } from '@guildofweavers/galois';

// RE-EXPORTS
// ================================================================================================
export { writeMerkleProof, readMerkleProof, writeMatrix, readMatrix, writeArray, readArray } from './serializaton';
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

export function getPseudorandomIndexes(seed: Buffer, count: number, max: number, excludeMultiplesOf = 0): number[] {
    const maxCount = excludeMultiplesOf ? max - max / excludeMultiplesOf : max;
    if (maxCount < count) throw Error(`Cannot select ${count} unique pseudorandom indexes from ${max} values`);
    
    const maxIterations = BigInt(count * 1000);
    const modulus = BigInt(max);
    const skip = BigInt(excludeMultiplesOf);
    const indexes = new Set<bigint>();

    const state = sha256(seed);
    for (let i = 0n; i < maxIterations; i++) {
        let index = sha256(state + i) % modulus;
        if (skip && index % skip === 0n) continue;  // if the index should be excluded, skip it
        if (indexes.has(index)) continue;           // if the index is already in the list, skip it
        indexes.add(index);
        if (indexes.size >= count) break;           // if we have enough indexes, break the loop
    }

    // if we couldn't generate enough indexes within max iterations, throw an error
    if (indexes.size < count) throw new Error(`Could not generate ${count} pseudorandom indexes`);

    const result: number[] = [];
    for (let index of indexes) {
        result.push(Number.parseInt(index.toString(16), 16));
    }

    return result;
}

export function bigIntsToBuffers(values: bigint[] | Vector, size: number): Buffer[] {
    const result = new Array<Buffer>(values.length);
    const maxValue = 2n**BigInt(size * 8);
    const hexSize = size * 2;

    if (!Array.isArray(values)) {
        values = values.toValues(); // TODO
    }

    for (let i = 0; i < values.length; i++) {
        let v = values[i];
        if (v >= maxValue) {
            throw Error('Cannot convert bigint to buffer: value is too large');
        }
        result[i] = Buffer.from(v.toString(16).padStart(hexSize, '0'), 'hex');
    }
    return result;
}

export function buffersToBigInts(values: Buffer[]): bigint[] {
    const result = new Array<bigint>(values.length);
    for (let i = 0; i < values.length; i++) {
        result[i] = BigInt('0x' + values[i].toString('hex'));
    }
    return result;
}

export function sha256(value: bigint | Buffer): bigint {
    const buffer = (typeof value === 'bigint')
        ? Buffer.from(value.toString(16), 'hex')
        : value;

    const hash = crypto.createHash('sha256').update(buffer);
    return BigInt('0x' + hash.digest().toString('hex'));
}