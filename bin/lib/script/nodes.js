"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const operations_1 = require("./operations");
const utils_1 = require("./utils");
// LITERAL
// ================================================================================================
class LiteralNode {
    constructor(value) {
        this.value = BigInt(value);
        this.dimensions = [1, 1];
        this.maxRegRef = this.maxConstRef = 0;
    }
    toCode() {
        return ((this.value < 0))
            ? `(${this.value.toString(10)}n)`
            : `${this.value.toString(10)}n`;
    }
    toString() {
        return this.value.toString(10);
    }
}
exports.LiteralNode = LiteralNode;
// VARIABLE
// ================================================================================================
class VariableNode {
    constructor(name, dimensions) {
        this.name = name;
        this.dimensions = dimensions;
        this.maxRegRef = this.maxConstRef = 0;
    }
    toCode() {
        return `${this.name}`;
    }
    toString() {
        return this.name;
    }
}
exports.VariableNode = VariableNode;
// REGISTER
// ================================================================================================
class RegisterNode {
    constructor(register) {
        this.name = register[0].toLowerCase();
        this.index = Number.parseInt(register.slice(1));
        this.dimensions = [1, 1];
    }
    get isReadonly() {
        return this.name === 'k';
    }
    get maxRegRef() {
        return (this.isReadonly ? 0 : this.index);
    }
    get maxConstRef() {
        return (this.isReadonly ? this.index : 0);
    }
    toCode(regRefBuilder) {
        return regRefBuilder(this.name, this.index);
    }
    toString() {
        return `${this.name}${this.index}`;
    }
}
exports.RegisterNode = RegisterNode;
// OPERATION
// ================================================================================================
class OperationNode {
    constructor(operator, children) {
        this.operator = operator;
        this.children = children;
        this.handler = operations_1.getOperationHandler(operator);
        const [c1, c2] = this.children;
        this.dimensions = this.handler.getDimensions(c1.dimensions, c2.dimensions);
        this.maxRegRef = Math.max(c1.maxRegRef, c2.maxRegRef);
        this.maxConstRef = Math.max(c1.maxConstRef, c2.maxConstRef);
    }
    toCode(regRefBuilder) {
        const [c1, c2] = this.children;
        return this.handler.getCode(c1, c2, regRefBuilder);
    }
    toString() {
        const [c1, c2] = this.children;
        return `(${c1.toString()} ${this.operator} ${c2.toString()})`;
    }
}
exports.OperationNode = OperationNode;
// VECTOR
// ================================================================================================
class VectorNode {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(children) {
        this.children = children;
        this.dimensions = [children.length, 1];
        if (children.length <= 1) {
            throw new Error('Vectors must contain at least 2 elements');
        }
        this.maxRegRef = this.maxConstRef = 0;
        for (let child of children) {
            if (!utils_1.isScalar(child.dimensions)) {
                throw new Error('All vector elements must be scalars');
            }
            if (child.maxRegRef > this.maxRegRef) {
                this.maxRegRef = child.maxRegRef;
            }
            if (child.maxConstRef > this.maxConstRef) {
                this.maxConstRef = child.maxConstRef;
            }
        }
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    toCode(regRefBuilder) {
        let result = '[';
        for (let i = 0; i < this.children.length; i++) {
            result += `${this.children[i].toCode(regRefBuilder)}, `;
        }
        return result.slice(0, -2) + ']';
    }
    toString() {
        let result = '[';
        for (let i = 0; i < this.children.length; i++) {
            result += `${this.children[i].toString()}, `;
        }
        return result.slice(0, -2) + ']';
    }
}
exports.VectorNode = VectorNode;
// MATRIX
// ================================================================================================
class MatrixNode {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(children) {
        this.children = children;
        const rowCount = children.length;
        if (rowCount === 0)
            throw new Error('Matrix must contain at least 1 row');
        const colCount = children[0].length;
        if (colCount <= 1)
            throw new Error('Matrix must contain at least 2 columns');
        this.dimensions = [rowCount, colCount];
        this.maxRegRef = this.maxConstRef = 0;
        for (let i = 0; i < rowCount; i++) {
            let row = children[i];
            if (row.length !== colCount) {
                throw new Error('All matrix rows must have the same number of elements');
            }
            for (let j = 0; j < colCount; j++) {
                let child = row[j];
                if (!utils_1.isScalar(child.dimensions)) {
                    throw new Error('All matrix elements must be scalars');
                }
                if (child.maxRegRef > this.maxRegRef) {
                    this.maxRegRef = child.maxRegRef;
                }
                if (child.maxConstRef > this.maxConstRef) {
                    this.maxConstRef = child.maxConstRef;
                }
            }
        }
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    toCode(regRefBuilder) {
        let result = '[';
        for (let i = 0; i < this.dimensions[0]; i++) {
            result += '[';
            for (let j = 0; j < this.dimensions[1]; j++) {
                result += `${this.children[i][j].toCode(regRefBuilder)}, `;
            }
            result = result.slice(0, -2) + '], ';
        }
        return result.slice(0, -2) + ']';
    }
    toString() {
        let result = '[ ';
        for (let i = 0; i < this.children.length; i++) {
            result += `${this.children[i].toString()}, `;
        }
        return result.slice(0, -2) + ' ]';
    }
}
exports.MatrixNode = MatrixNode;
//# sourceMappingURL=nodes.js.map