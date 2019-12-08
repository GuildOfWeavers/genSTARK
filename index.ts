// IMPORTS
// ================================================================================================
import { StarkOptions, Logger } from '@guildofweavers/genstark';
import { AirSchema, compile as compileAirAssembly } from '@guildofweavers/air-assembly';
import { Stark } from './lib/Stark';
import { noopLogger } from './lib/utils';

// RE-EXPORTS
// ================================================================================================
export { Stark } from './lib/Stark';
export { inline } from './lib/utils';
export { MerkleTree, createHash } from '@guildofweavers/merkle';
export { createPrimeField } from '@guildofweavers/galois';

// PUBLIC FUNCTIONS
// ================================================================================================
export function instantiate(source: AirSchema | Buffer | string, options?: Partial<StarkOptions>, logger?: Logger): Stark {
    if (logger === null) {
        logger = noopLogger;
    }

    if (source instanceof AirSchema) {
        return new Stark(source, options, logger);
    }
    else {
        const schema = compileAirAssembly(source as any);
        return new Stark(schema, options, logger);
    }
}