"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// CLASS DEFINITION
// ================================================================================================
class Logger {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor() {
        this.timestampMap = new Map();
        this.prefixMap = new Map();
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
        return label;
    }
    log(label, message) {
        const [start, ts] = this.timestampMap.get(label);
        const prefix = this.prefixMap.get(label);
        console.log(`${prefix}${message} in ${Date.now() - ts} ms`);
        this.timestampMap.set(label, [start, Date.now()]);
    }
    done(label, message) {
        const [start] = this.timestampMap.get(label);
        this.timestampMap.delete(label);
        if (message) {
            console.log(`${message} in ${Date.now() - start} ms`);
        }
    }
}
exports.Logger = Logger;
//# sourceMappingURL=Logger.js.map