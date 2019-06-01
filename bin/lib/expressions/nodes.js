"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// LITERAL
// ================================================================================================
class LiteralNode {
    constructor(value) {
        this.value = BigInt(value);
    }
    toCode() {
        return `${this.value.toString(10)}n`;
    }
    toString() {
        return this.value.toString(10);
    }
}
exports.LiteralNode = LiteralNode;
// REGISTER
// ================================================================================================
class RegisterNode {
    constructor(register) {
        this.name = register[0].toLowerCase();
        this.index = Number.parseInt(register.slice(1));
    }
    get isReadonly() {
        return this.name === 'k';
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
const OP_FUNCTIONS = {
    '+': 'add',
    '-': 'sub',
    '*': 'mul',
    '/': 'div',
    '^': 'exp'
};
class OperationNode {
    constructor(operation, children) {
        this.operation = operation;
        this.children = children;
        this.funcName = OP_FUNCTIONS[operation];
    }
    toCode(regRefBuilder) {
        const [c1, c2] = this.children;
        return `field.${this.funcName}(${c1.toCode(regRefBuilder)}, ${c2.toCode(regRefBuilder)})`;
    }
    toString() {
        const [c1, c2] = this.children;
        return `(${c1.toString()} ${this.operation} ${c2.toString()})`;
    }
}
exports.OperationNode = OperationNode;
//# sourceMappingURL=nodes.js.map