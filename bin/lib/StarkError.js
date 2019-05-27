"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// CLASS DEFINITION
// ================================================================================================
class StarkError extends Error {
    constructor(message, cause) {
        if (!cause) {
            super(message);
        }
        else {
            super(`${message}: ${cause.message}`);
        }
    }
}
exports.StarkError = StarkError;
//# sourceMappingURL=StarkError.js.map