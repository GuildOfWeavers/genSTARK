// IMPORTS
// ================================================================================================
import { tokenize } from './tokenizer';
import { parseExpression, parseVector, parseMatrix } from './parsers';
import { AstNode, RegRefBuilder } from './nodes';
import { Dimensions, isVector, isMatrix, validateVariableName } from './utils';

// MODULE VARIABLE
// ================================================================================================
export const OUTPUT_NAME = 'out';

// CLASS DEFINITION
// ================================================================================================
export class Script {

    readonly variables  : Map<string, Dimensions>;
    readonly statements : Array<[string, AstNode]>;
    readonly output     : AstNode;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(text: string, maxConstants: number, maxRegisters?: number) {
        const statements = text.trim().split(';');
        
        this.variables = new Map<string, Dimensions>();
        this.statements = new Array<[string, AstNode]>();
    
        // remove out statement from the script
        const outStatement = popOutStatement(statements);

        // parse body statements
        for (let i = 0; i < statements.length; i++) {
            try {
                let statement = statements[i].trim();
                if (statement.length === 0) continue;

                let parts = statement.split(':');
                if (parts.length === 1) throw new Error(`Missing assignment operator ':'`);
                if (parts.length > 2) throw new Error(`Too many assignment operators ':'`);

                // tokenize the statement
                let tokens = tokenize(parts[1], true);
                if (tokens.length === 0) throw new Error(`Assignment expression cannot be empty`);

                // convert tokens into an expression
                let expression = (tokens[0].type === 'bracket')
                    ? parseVectorOrMatrix(tokens, this.variables)
                    : parseExpression(tokens, this.variables);
    
                // validate variable name
                let variable = addVariable(parts[0], expression.dimensions, this.variables);
    
                // add the processed statement to the list
                this.statements.push([variable, expression]);
            }
            catch (error) {
                throw new Error(`Statement ${i+1} is malformed: ${error.message}`);
            }
        }

        // parse out statement
        try {
            const tokens = tokenize(outStatement, true);
            if (tokens.length === 0) throw new Error(`statement cannot be empty`);
            const expression = (tokens[0].type === 'bracket')
                    ? parseVectorOrMatrix(tokens, this.variables)
                    : parseExpression(tokens, this.variables);
            
            if (isMatrix(expression.dimensions)) {
                throw new Error('statement cannot evaluate to a matrix');
            }
            this.output = expression;
        }
        catch (error) {
            throw new Error(`Out statement is malformed: ${error.message}`);
        }

        maxRegisters = maxRegisters || this.outputWidth;
        validateRegisterReferences(this.statements, maxRegisters, maxConstants);
    }

    // PUBLIC ACCESSORS
    // --------------------------------------------------------------------------------------------
    get outputWidth(): number {
        return this.output.dimensions[0];
    }

    get outputVariableName(): string {
        return OUTPUT_NAME;
    }

    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    toCode(regRefBuilder: RegRefBuilder) {

        // variable declaration
        let code = `let ${OUTPUT_NAME}`;
        if (this.variables.size > 0) {
            code += `, ${Array.from(this.variables.keys()).join(', ')};\n`;
        }
        else {
            code += ';\n';
        }

        // script body
        for (let statement of this.statements) {
            let variable = statement[0];
            let expression = statement[1];
            code += `${variable} = ${expression.toCode(regRefBuilder)};\n`;
        }

        // script output
        if (isVector(this.output.dimensions)) {
            code += `${OUTPUT_NAME} = ${this.output.toCode(regRefBuilder)};`;
        }
        else {
            code += `${OUTPUT_NAME} = [${this.output.toCode(regRefBuilder)}];`;
        }

        return code;
    }
}

// HELPER FUNCTIONS
// ================================================================================================
function popOutStatement(statements: string[]): string {
    let outStatement: string | undefined;
    while (statements.length > 0) {
        outStatement = statements.pop();
        if (!outStatement) continue;

        let parts = outStatement.split(':');
        if (parts[0].trim() !== OUTPUT_NAME) {
            throw new Error(`A script must terminate with an '${OUTPUT_NAME}:' statement`);
        }
        if (parts.length !== 2 || !parts[1].trim()) {
            throw new Error('Out statement is malformed');
        }

        return parts[1].trim();
    }
    throw new Error(`A script must terminate with an '${OUTPUT_NAME}:' statement`);
}

function addVariable(variable: string, dimensions: Dimensions, variables: Map<string, Dimensions>): string {
    variable = variable.trim();

    if (variables.has(variable)) {
        let dim = variables.get(variable)!;
        if (dim[0] !== dimensions[0] && dim[1] != dimensions[1]) {
            throw new Error(`Dimensions of variable '${variable}' cannot be changed`);
        }
    }
    else {
        validateVariableName(variable, dimensions);
        variables.set(variable, dimensions);
    }

    return variable;
}

function parseVectorOrMatrix(tokens: any[], variables: Map<string, Dimensions>) {
    if (tokens[0].value === ']') throw new Error('Unexpected close bracket');
    if (tokens.length < 2) throw new Error('Unclosed bracket');
    return (tokens[1].type === 'bracket')
        ? parseMatrix(tokens, variables)
        : parseVector(tokens, variables);
}

function validateRegisterReferences(statements: Array<[string, AstNode]>, maxRegisters: number, maxConstants: number) {

    const regInfoMessage = `register index must be smaller than ${maxRegisters}`;
    const constInfoMessage = (maxConstants === 0)
        ? `no constants have been defined`
        : `constant index must be smaller than ${maxConstants}`;

    for (let i = 0; i < statements.length; i++) {
        let  [variable, expression] = statements[i];

        if (expression.maxRegRef >= maxRegisters) {
            throw (variable === OUTPUT_NAME)
                ? new Error(`Invalid register reference out statement: ${regInfoMessage}`)
                : new Error(`Invalid register reference in statement ${i}: ${regInfoMessage}`);
        }

        if (expression.maxConstRef >= maxConstants) {
            throw (variable === OUTPUT_NAME)
                ? new Error(`Invalid constant reference out statement: ${constInfoMessage}`)
                : new Error(`Invalid constant reference in statement ${i}: ${constInfoMessage}`);
        }
    }
}