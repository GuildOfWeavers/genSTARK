// IMPORTS
// ================================================================================================
import * as crypto from 'crypto';

// RE-EXPORTS
// ================================================================================================
export { readMerkleProof, readMatrix, readArray } from './readers';
export { writeMerkleProof, writeMatrix, writeArray } from './writers';
export { sizeOf } from './sizeof';
export { Logger } from './Logger';

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
    const modulus = BigInt(max);
    const skip = BigInt(excludeMultiplesOf);
    const indexes = new Set<bigint>();

    // TODO: improve
    let seed2 = sha256(seed);
    while (indexes.size < count) {
        seed2 = sha256(seed2);
        let index = seed2 % modulus;
        if (skip && index % skip === 0n) continue;
        if (indexes.has(index)) continue;
        indexes.add(index)
    }

    const result: number[] = [];
    for (let index of indexes) {
        result.push(Number.parseInt(index.toString(16), 16));
    }

    return result;
}

export function bigIntsToBuffers(values: bigint[], size: number): Buffer[] {
    const result = new Array<Buffer>(values.length);
    const hexSize = size * 2;
    for (let i = 0; i < values.length; i++) {
        // TODO: check for overflow
        result[i] = Buffer.from(values[i].toString(16).padStart(hexSize, '0'), 'hex');
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