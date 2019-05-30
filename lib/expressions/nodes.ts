// INTERFACES
// ================================================================================================
export interface AstNode {
    toString(): string;
    toCode(regRefBuilder: RegRefBuilder): string;
}

interface RegRefBuilder {
    (name: string, index: number): string;
}

// LITERAL
// ================================================================================================
export class LiteralNode {

    readonly value: bigint;

    constructor(value: string) {
        this.value = BigInt(value);
    }

    toCode() {
        return `${this.value.toString(10)}n`;
    }

    toString() {
        return this.value.toString(10);
    }
}

// REGISTER
// ================================================================================================
export class RegisterNode {
    
    readonly array  : string;
    readonly index  : number;

    constructor(register: string) {
        this.array = register[0].toLowerCase();
        this.index = Number.parseInt(register.slice(1));
    }

    toCode(regRefBuilder: RegRefBuilder) {
        return regRefBuilder(this.array, this.index);
    }

    toString() {
        return `${this.array}${this.index}`;
    }
}

// OPERATION
// ================================================================================================
const OP_FUNCTIONS: { [op: string]: string } = {
    '+' : 'add',
    '-' : 'sub',
    '*' : 'mul',
    '/' : 'div',
    '^' : 'exp'
};

export class OperationNode {

    readonly funcName   : string;
    readonly operation  : string;
    readonly children   : [any, any];

    constructor(operation: string, children: [any, any]) {
        this.operation = operation;
        this.children = children;
        this.funcName = OP_FUNCTIONS[operation];
    }

    toCode(regRefBuilder: RegRefBuilder) {
        const [c1, c2] = this.children;
        return `field.${this.funcName}(${c1.toCode(regRefBuilder)}, ${c2.toCode(regRefBuilder)})`;
    }

    toString() {
        const [c1, c2] = this.children;
        return `(${c1.toString()} ${this.operation} ${c2.toString()})`;
    }
}