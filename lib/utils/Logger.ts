// IMPORTS
// ================================================================================================
import { Logger as ILogger, LogFunction } from "@guildofweavers/genstark";

// CLASS DEFINITION
// ================================================================================================
export class Logger implements ILogger {

    private timestampMap: Map<symbol, [number, number]>;
    private prefixMap   : Map<symbol, string>;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor() {
        this.timestampMap = new Map();
        this.prefixMap = new Map();
    }

    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    start(message?: string, prefix?: string): symbol {
        if (message) {
            console.log(message);
        }
        const label = Symbol();
        const ts = Date.now();
        this.timestampMap.set(label, [ts, ts]);
        this.prefixMap.set(label, prefix || '');
        return label;
    }

    log(label: symbol, message: string) {
        const [start, ts] = this.timestampMap.get(label)!;
        const prefix = this.prefixMap.get(label)!;
        console.log(`${prefix}${message} in ${Date.now() - ts} ms`);
        this.timestampMap.set(label, [start, Date.now()]);
    }
    
    done(label: symbol, message?: string) {
        const [start] = this.timestampMap.get(label)!;
        this.timestampMap.delete(label);
        if (message) {
            console.log(`${message} in ${Date.now() - start} ms`);
        }
    }
}