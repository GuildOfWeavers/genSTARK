// IMPORTS
// ================================================================================================
import { OperationHandler, getOperationHandler } from './operations';
import { Dimensions, isScalar, validateVariableName } from './utils';

// INTERFACES
// ================================================================================================
export interface AstNode {
    dimensions  : Dimensions;
    maxRegRef   : number;
    maxConstRef : number;

    toString(): string;
    toCode(regRefBuilder: RegRefBuilder): string;
}

export interface RegRefBuilder {
    (name: string, index: number): string;
}

// LITERAL
// ================================================================================================
export class LiteralNode implements AstNode {

    readonly value          : bigint;
    readonly dimensions     : Dimensions;
    readonly maxRegRef      : number;
    readonly maxConstRef    : number;

    constructor(value: string) {
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

// VARIABLE
// ================================================================================================
export class VariableNode implements AstNode {

    readonly name           : string;
    readonly dimensions     : Dimensions;
    readonly maxRegRef      : number;
    readonly maxConstRef    : number;

    constructor(name: string, dimensions: Dimensions) {
        this.name = name;
        this.dimensions = dimensions;
        this.maxRegRef = this.maxConstRef = 0;
        validateVariableName(name, dimensions);
    }

    toCode() {
        return `${this.name}`;
    }

    toString() {
        return this.name;
    }
}

// REGISTER
// ================================================================================================
export class RegisterNode implements AstNode {
    
    readonly name       : string;
    readonly index      : number;
    readonly dimensions : Dimensions;

    constructor(register: string) {
        this.name = register.slice(0, 2);
        this.index = Number.parseInt(register.slice(2));
        this.dimensions = [1, 1];
    }

    get isReadonly(): boolean {
        return this.name === '$k';
    }

    get maxRegRef(): number {
        return (this.isReadonly ? 0 : this.index);
    }

    get maxConstRef(): number {
        return (this.isReadonly ? this.index : 0);
    }

    toCode(regRefBuilder: RegRefBuilder) {
        return regRefBuilder(this.name, this.index);
    }

    toString() {
        return `${this.name}${this.index}`;
    }
}

// OPERATION
// ================================================================================================
export class OperationNode implements AstNode {

    readonly operator       : string;
    readonly handler        : OperationHandler;
    readonly children       : [AstNode, AstNode];
    readonly dimensions     : Dimensions;
    readonly maxRegRef      : number;
    readonly maxConstRef    : number;

    constructor(operator: string, children: [AstNode, AstNode]) {
        this.operator = operator;
        this.children = children;
        this.handler = getOperationHandler(operator);

        const [c1, c2] = this.children;
        this.dimensions = this.handler.getDimensions(c1.dimensions, c2.dimensions);
        this.maxRegRef = Math.max(c1.maxRegRef, c2.maxRegRef);
        this.maxConstRef = Math.max(c1.maxConstRef, c2.maxConstRef);
    }

    toCode(regRefBuilder: RegRefBuilder) {
        const [c1, c2] = this.children;
        return this.handler.getCode(c1, c2, regRefBuilder);
    }

    toString() {
        const [c1, c2] = this.children;
        return `(${c1.toString()} ${this.operator} ${c2.toString()})`;
    }
}

// VECTOR
// ================================================================================================
export class VectorNode implements AstNode {

    readonly children       : AstNode[];
    readonly dimensions     : Dimensions;
    readonly maxRegRef      : number;
    readonly maxConstRef    : number;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(children: AstNode[]) {
        this.children = children;
        this.dimensions = [children.length, 1];
        if (children.length <= 1) {
            throw new Error('Vectors must contain at least 2 elements');
        }

        this.maxRegRef = this.maxConstRef = 0;
        for (let child of children) {
            if (!isScalar(child.dimensions)) {
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
    toCode(regRefBuilder: RegRefBuilder) {
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

// MATRIX
// ================================================================================================
export class MatrixNode implements AstNode {

    readonly children       : AstNode[][];
    readonly dimensions     : Dimensions;
    readonly maxRegRef      : number;
    readonly maxConstRef    : number;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(children: AstNode[][]) {
        this.children = children;

        const rowCount = children.length;
        if (rowCount === 0) throw new Error('Matrix must contain at least 1 row');
        const colCount = children[0].length;
        if (colCount <= 1) throw new Error('Matrix must contain at least 2 columns');
        this.dimensions = [rowCount, colCount];
        
        this.maxRegRef = this.maxConstRef = 0;
        for (let i = 0; i < rowCount; i++) {
            let row = children[i];
            if (row.length !== colCount)  {
                throw new Error('All matrix rows must have the same number of elements');
            }

            for (let j = 0; j < colCount; j++) {
                let child = row[j];

                if (!isScalar(child.dimensions)) {
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
    toCode(regRefBuilder: RegRefBuilder) {
        let result = '[';
        for (let i = 0; i < this.dimensions[0]; i++) {
            result += '['
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