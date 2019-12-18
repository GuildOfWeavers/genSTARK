// IMPORTS
// ================================================================================================
import { StarkOptions, Logger } from '@guildofweavers/genstark';
import { AirSchema, compile as compileAirAssembly } from '@guildofweavers/air-assembly';
import { Stark } from './lib/Stark';
import { Logger as ConsoleLogger, noopLogger } from './lib/utils';

// RE-EXPORTS
// ================================================================================================
export { Stark } from './lib/Stark';
export { inline } from './lib/utils';
export { MerkleTree, createHash } from '@guildofweavers/merkle';
export { createPrimeField } from '@guildofweavers/galois';

// PUBLIC FUNCTIONS
// ================================================================================================
export function instantiate(source: AirSchema | Buffer | string, component: string, options?: Partial<StarkOptions>, logger?: Logger): Stark {
    if (logger === null) {
        logger = noopLogger;
    }
    else if (logger === undefined) {
        logger = new ConsoleLogger();
    }

    if (source instanceof AirSchema) {
        return new Stark(source, component, options, logger);
    }
    else {
        const schema = compileAirAssembly(source as any);
        return new Stark(schema, component, options, logger);
    }
}