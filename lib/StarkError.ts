// CLASS DEFINITION
// ================================================================================================
export class StarkError extends Error {

    constructor(message: string, cause?: Error) {
        if (!cause) {
            super(message);
        }
        else {
            super(`${message}: ${cause.message}`);
        }
    }
    
}