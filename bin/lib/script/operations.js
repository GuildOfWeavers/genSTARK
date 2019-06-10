"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const utils_1 = require("./utils");
// PUBLIC FUNCTIONS
// ================================================================================================
function getOperationHandler(operator) {
    if (operator === '+')
        return addition;
    else if (operator === '-')
        return subtraction;
    else if (operator === '*')
        return multiplication;
    else if (operator === '/')
        return division;
    else if (operator === '^')
        return exponentiation;
    else if (operator === '#')
        return product;
    else
        throw new Error(`Operator '${operator}' is not supported`);
}
exports.getOperationHandler = getOperationHandler;
// ADDITION
// ================================================================================================
const addition = {
    name: 'add',
    getDimensions(d1, d2) {
        if (utils_1.isScalar(d2))
            return d1;
        else if (d1[0] === d2[0] && d1[1] === d2[1])
            return d1;
        else
            throw new Error(`Cannot add ${d1[0]}x${d1[1]} value to ${d2[0]}x${d2[1]} value`);
    },
    getCode(op1, op2, regRefBuilder) {
        const d1 = op1.dimensions;
        const parameters = `${op1.toCode(regRefBuilder)}, ${op2.toCode(regRefBuilder)}`;
        if (utils_1.isScalar(d1))
            return `field.add(${parameters})`;
        else if (utils_1.isVector(d1))
            return `field.addVectorElements(${parameters})`;
        else
            return `field.addMatrixElements(${parameters})`;
    }
};
// SUBTRACTION
// ================================================================================================
const subtraction = {
    name: 'sub',
    getDimensions(d1, d2) {
        if (utils_1.isScalar(d2))
            return d1;
        else if (d1[0] === d2[0] && d1[1] === d2[1])
            return d1;
        else
            throw new Error(`Cannot subtract ${d1[0]}x${d1[1]} value from ${d2[0]}x${d2[1]} value`);
    },
    getCode(op1, op2, regRefBuilder) {
        const d1 = op1.dimensions;
        const parameters = `${op1.toCode(regRefBuilder)}, ${op2.toCode(regRefBuilder)}`;
        if (utils_1.isScalar(d1))
            return `field.sub(${parameters})`;
        else if (utils_1.isVector(d1))
            return `field.subVectorElements(${parameters})`;
        else
            return `field.subMatrixElements(${parameters})`;
    }
};
// MULTIPLICATION
// ================================================================================================
const multiplication = {
    name: 'mul',
    getDimensions(d1, d2) {
        if (utils_1.isScalar(d2))
            return d1;
        else if (d1[0] === d2[0] && d1[1] === d2[1])
            return d1;
        else
            throw new Error(`Cannot multiply ${d1[0]}x${d1[1]} value by ${d2[0]}x${d2[1]} value`);
    },
    getCode(op1, op2, regRefBuilder) {
        const d1 = op1.dimensions;
        const parameters = `${op1.toCode(regRefBuilder)}, ${op2.toCode(regRefBuilder)}`;
        if (utils_1.isScalar(d1))
            return `field.mul(${parameters})`;
        else if (utils_1.isVector(d1))
            return `field.mulVectorElements(${parameters})`;
        else
            return `field.mulMatrixElements(${parameters})`;
    }
};
// DIVISION
// ================================================================================================
const division = {
    name: 'div',
    getDimensions(d1, d2) {
        if (utils_1.isScalar(d2))
            return d1;
        else if (d1[0] === d2[0] && d1[1] === d2[1])
            return d1;
        else
            throw new Error(`Cannot divide ${d1[0]}x${d1[1]} value by ${d2[0]}x${d2[1]} value`);
    },
    getCode(op1, op2, regRefBuilder) {
        const d1 = op1.dimensions;
        const parameters = `${op1.toCode(regRefBuilder)}, ${op2.toCode(regRefBuilder)}`;
        if (utils_1.isScalar(d1))
            return `field.div(${parameters})`;
        else if (utils_1.isVector(d1))
            return `field.divVectorElements(${parameters})`;
        else
            return `field.divMatrixElements(${parameters})`;
    }
};
// EXPONENTIATION
// ================================================================================================
const exponentiation = {
    name: 'exp',
    getDimensions(d1, d2) {
        if (utils_1.isScalar(d2))
            return d1;
        else
            throw new Error(`Cannot raise to non-scalar power`);
    },
    getCode(op1, op2, regRefBuilder) {
        const d1 = op1.dimensions;
        const parameters = `${op1.toCode(regRefBuilder)}, ${op2.toCode(regRefBuilder)}`;
        if (utils_1.isScalar(d1))
            return `field.exp(${parameters})`;
        else if (utils_1.isVector(d1))
            return `field.expVectorElements(${parameters})`;
        else
            return `field.expMatrixElements(${parameters})`;
    }
};
// MATRIX AND VECTOR PRODUCT
// ================================================================================================
const product = {
    name: 'prod',
    getDimensions(d1, d2) {
        if (utils_1.isVector(d1) && utils_1.isVector(d2) && d1[0] === d2[0])
            return [1, 1];
        else if (utils_1.isMatrix(d1) && d1[1] === d2[0])
            return [d1[0], d2[1]];
        else
            throw new Error(`Cannot compute a product of ${d1[0]}x${d1[1]} and ${d2[0]}x${d2[1]} values`);
    },
    getCode(op1, op2, regRefBuilder) {
        const d1 = op1.dimensions;
        const d2 = op2.dimensions;
        const parameters = `${op1.toCode(regRefBuilder)}, ${op2.toCode(regRefBuilder)}`;
        if (utils_1.isVector(d1) && utils_1.isVector(d2))
            return `field.combineVectors(${parameters})`;
        else if (utils_1.isMatrix(d1) && utils_1.isVector(d2))
            return `field.mulMatrixByVector(${parameters})`;
        else
            return `field.mulMatrixes(${parameters})`;
    }
};
//# sourceMappingURL=operations.js.map