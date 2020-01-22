// IMPORTS
// ================================================================================================
import { FiniteField } from "@guildofweavers/galois";

// MiMC FUNCTION
// ================================================================================================
export function runMimc(field: FiniteField, steps: number, roundConstants: bigint[], seed: bigint): bigint[] {
    const result = [seed];
    for (let i = 0; i < steps - 1; i++) {
        let value = field.add(field.exp(result[i], 3n), roundConstants[i % roundConstants.length]);
        result.push(value);
    }

    return result;
}