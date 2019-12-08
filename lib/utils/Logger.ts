// IMPORTS
// ================================================================================================
import { Logger as ILogger, LogFunction } from "@guildofweavers/genstark";
import { noop } from "./index";

// CLASS DEFINITION
// ================================================================================================
export class Logger implements ILogger {

    private functionMap : Map<LogFunction, symbol>;
    private timestampMap: Map<symbol, [number, number]>;
    private prefixMap   : Map<symbol, string>;
    private enableSubLog: boolean;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(enableSubLog = true) {
        this.functionMap = new Map();
        this.timestampMap = new Map();
        this.prefixMap = new Map();
        this.enableSubLog = enableSubLog;
    }

    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    start(message?: string, prefix?: string): LogFunction {
        if (message) {
            console.log(message);
        }
        const label = Symbol();
        const ts = Date.now();
        this.timestampMap.set(label, [ts, ts]);
        this.prefixMap.set(label, prefix || '');
        const log = this.log.bind(this, label);
        this.functionMap.set(log, label);
        return log;
    }
    
    sub(message?: string): LogFunction {
        if (this.enableSubLog) {
            return this.start(message, '  ');
        }
        else {
            return noop;
        }
    }

    done(log: LogFunction, message?: string): void {
        if (log === noop) return;
        const label = this.functionMap.get(log)!;
        const [start] = this.timestampMap.get(label)!;
        if (message) {
            console.log(`${message} in ${Date.now() - start} ms`);
        }
        this.functionMap.delete(log);
        this.timestampMap.delete(label);
        this.prefixMap.delete(label);
    }

    // PRIVATE METHODS
    // --------------------------------------------------------------------------------------------
    private log(label: symbol, message: string) {
        const [start, ts] = this.timestampMap.get(label)!;
        const prefix = this.prefixMap.get(label)!;
        console.log(`${prefix}${message} in ${Date.now() - ts} ms`);
        this.timestampMap.set(label, [start, Date.now()]);
    }
}

// NOOP LOGGER
// ================================================================================================
const noopLog: LogFunction = (message: string) => undefined;
export const noopLogger: ILogger = {
    start   : (message?: string, prefix?: string) => noopLog,
    sub     : (message?: string) => noopLog,
    done    : (log: LogFunction, message?: string) => undefined
};