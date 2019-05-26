"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class Logger {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor() {
        this.labels = new Map();
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    start(message) {
        if (message) {
            console.log(message);
        }
        const label = Symbol();
        const ts = Date.now();
        this.labels.set(label, [ts, ts]);
        return label;
    }
    log(label, message) {
        const [start, ts] = this.labels.get(label);
        console.log(`${message} in ${Date.now() - ts} ms`);
        this.labels.set(label, [start, Date.now()]);
    }
    done(label, message) {
        const [start] = this.labels.get(label);
        this.labels.delete(label);
        if (message) {
            console.log(`${message} in ${Date.now() - start} ms`);
        }
    }
}
exports.Logger = Logger;
//# sourceMappingURL=Logger.js.map