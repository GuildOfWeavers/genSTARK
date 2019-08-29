// IMPORTS
// ================================================================================================
import { BatchMerkleProof, Hash } from '@guildofweavers/merkle';
import * as inliners from './inliners';

// RE-EXPORTS
// ================================================================================================
export * from './serialization';
export { sizeOf } from './sizeof';
export { Logger } from './Logger';
export const inline = inliners;

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

// MERKLE PROOF
// ================================================================================================
export function rehashMerkleProofValues(proof: BatchMerkleProof, hash: Hash): BatchMerkleProof {
    const hashedValues = new Array<Buffer>(proof.values.length);
    for (let i = 0; i < hashedValues.length; i++) {
        hashedValues[i] = hash.digest(proof.values[i]);
    }

    return {
        nodes   : proof.nodes,
        values  : hashedValues,
        depth   : proof.depth
    };
}

// OTHER
// ================================================================================================
export function noop() {};