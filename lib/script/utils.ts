// IMPORTS
// ================================================================================================
import { matchers } from './tokenizer';

// MODULE VARIABLE
// ================================================================================================
const variableNamePattern = matchers.find(m => m.type === 'variable')!.match;

// DIMENSIONS
// ================================================================================================
export type Dimensions = [number, number];

export function isScalar(dim: Dimensions) {
    return (dim[0] === 1 && dim[1] === 1);
}

export function isVector(dim: Dimensions) {
    return (dim[0] > 1 && dim[1] === 1);
}

export function isMatrix(dim: Dimensions) {
    return (dim[1] > 1);
}

// VARIABLE NAME
// ================================================================================================
export function validateVariableName(name: string, dimensions: Dimensions) {

    const errorMessage = `Variable name '${name}' is invalid`; 

    // TODO: check for 'out' and JavaScript reserved words

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