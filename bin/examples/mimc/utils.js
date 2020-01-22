"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// MiMC FUNCTION
// ================================================================================================
function runMimc(field, steps, roundConstants, seed) {
    const result = [seed];
    for (let i = 0; i < steps - 1; i++) {
        let value = field.add(field.exp(result[i], 3n), roundConstants[i % roundConstants.length]);
        result.push(value);
    }
    return result;
}
exports.runMimc = runMimc;
//# sourceMappingURL=utils.js.map