"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const index_1 = require("./index");
// CLASS DEFINITION
// ================================================================================================
class Logger {
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
    start(message, prefix) {
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
    sub(message) {
        if (this.enableSubLog) {
            return this.start(message, '  ');
        }
        else {
            return index_1.noop;
        }
    }
    done(log, message) {
        if (log === index_1.noop)
            return;
        const label = this.functionMap.get(log);
        const [start] = this.timestampMap.get(label);
        if (message) {
            console.log(`${message} in ${Date.now() - start} ms`);
        }
        this.functionMap.delete(log);
        this.timestampMap.delete(label);
        this.prefixMap.delete(label);
    }
    // PRIVATE METHODS
    // --------------------------------------------------------------------------------------------
    log(label, message) {
        const [start, ts] = this.timestampMap.get(label);
        const prefix = this.prefixMap.get(label);
        console.log(`${prefix}${message} in ${Date.now() - ts} ms`);
        this.timestampMap.set(label, [start, Date.now()]);
    }
}
exports.Logger = Logger;
// NOOP LOGGER
// ================================================================================================
const noopLog = (message) => undefined;
exports.noopLogger = {
    start: (message, prefix) => noopLog,
    sub: (message) => noopLog,
    done: (log, message) => undefined
};
//# sourceMappingURL=Logger.js.map