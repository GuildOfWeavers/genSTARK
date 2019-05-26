export class Logger {

    private labels : Map<symbol, [number, number]>;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor() {
        this.labels = new Map();
    }

    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    start(message?: string): symbol {
        if (message) {
            console.log(message);
        }
        const label = Symbol();
        const ts = Date.now();
        this.labels.set(label, [ts, ts]);
        return label;
    }

    log(label: symbol, message: string) {
        const [start, ts] = this.labels.get(label)!;
        console.log(`${message} in ${Date.now() - ts} ms`);
        this.labels.set(label, [start, Date.now()]);
    }
    
    done(label: symbol, message?: string) {
        const [start] = this.labels.get(label)!;
        this.labels.delete(label);
        if (message) {
            console.log(`${message} in ${Date.now() - start} ms`);
        }
    }
}