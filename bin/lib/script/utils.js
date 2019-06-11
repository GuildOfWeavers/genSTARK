"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const tokenizer_1 = require("./tokenizer");
// MODULE VARIABLE
// ================================================================================================
const variableNamePattern = tokenizer_1.matchers.find(m => m.type === 'variable').match;
function isScalar(dim) {
    return (dim[0] === 1 && dim[1] === 1);
}
exports.isScalar = isScalar;
function isVector(dim) {
    return (dim[0] > 1 && dim[1] === 1);
}
exports.isVector = isVector;
function isMatrix(dim) {
    return (dim[1] > 1);
}
exports.isMatrix = isMatrix;
// VARIABLE NAME
// ================================================================================================
function validateVariableName(name, dimensions) {
    const errorMessage = `Variable name '${name}' is invalid`;
    const match = name.match(variableNamePattern);
    if (!match || match[0].length !== name.length) {
        throw new Error(errorMessage);
    }
    if (isScalar(dimensions)) {
        if (name != name.toLowerCase()) {
            throw new Error(`${errorMessage}: scalar variable names cannot contain uppercase characters`);
        }
    }
    else if (isVector(dimensions)) {
        if (name != name.toUpperCase()) {
            throw new Error(`${errorMessage}: vector variable names cannot contain lowercase characters`);
        }
    }
    else {
        if (name != name.toUpperCase()) {
            throw new Error(`${errorMessage}: matrix variable names cannot contain lowercase characters`);
        }
    }
}
exports.validateVariableName = validateVariableName;
//# sourceMappingURL=utils.js.map