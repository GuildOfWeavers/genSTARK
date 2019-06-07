// IMPORTS
// ================================================================================================
import { tokenize, matchers } from "./tokenizer";
import { parseOperations } from './parser';
import { AstNode, RegisterNode, VariableNode, LiteralNode, RegRefBuilder } from "./nodes";

// RE-EXPORTS
// ================================================================================================
export { AstNode } from './nodes';

// MODULE VARABLES
// ================================================================================================
export const symScript = Symbol('script');
const vNamePattern = matchers.find(m => m.type === 'variable')!.match;

// PUBLIC FUNCTIONS
// ================================================================================================
export function parseScript(script: string, maxRegisters: number, maxConstants: number) {
    const statements = script.split(';');

    const variables = new Set<string>();
    const expressions = new Array<[string, AstNode]>();
    
    for (let i = 0; i < statements.length; i++) {
        let statement = statements[i].trim();
        if (statement.length === 0) continue;
        let [ variable, expression ] = statement.split(':');
        variable = validateVariableName(variable);
        variables.add(variable);
        expressions.push([variable, parseExpression(expression, variables, maxRegisters, maxConstants)]);
    }

    return new Script(variables, expressions);
}

export function parseExpression(expression: string, variables: Set<string>, maxRegisters: number, maxConstants: number): AstNode {
    const tokens: any[] = tokenize(expression, true);

    // convert registers, variables, literals to AST nodes
    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        if (token.type === 'register') {
            tokens[i] = new RegisterNode(token.value);
            validateRegisterIndex(tokens[i], maxRegisters, maxConstants);
        } else if (token.type === 'variable') {
            tokens[i] = new VariableNode(token.value);
            validateVariableReference(tokens[i], variables);
        } else if (token.type === 'literal') {
            tokens[i] = new LiteralNode(token.value);
        }
    }

    const ast = parseOperations(tokens);
    return ast;
}

// SCRIPT CLASS DEFINITION
// ================================================================================================
export class Script {

    readonly variables  : Set<string>;
    readonly statements : ([string, AstNode])[];

    constructor(variables: Set<string>, statments: ([string, AstNode])[]) {
        this.variables = variables;
        this.statements = statments;
    }

    toCode(regRefBuilder: RegRefBuilder) {
        let code = `let ${Array.from(this.variables).join(',')};\n`;
        for (let statment of this.statements) {
            let variable = statment[0];
            let expression = statment[1];
            code += `${variable} = ${expression.toCode(regRefBuilder)};\n`;
        }
        return code;
    }
}

// HELPER FUNCTIONS
// ================================================================================================
function validateRegisterIndex(r: RegisterNode, maxRegisters: number, maxConstants: number) {
    if (r.isReadonly) {
        if (maxConstants === 0) {
            throw new Error(`Invalid constant reference '${r.name}${r.index}': no constants have been defined`);
        }
        else if (r.index >= maxConstants) {
            throw new Error(`Invalid constant reference '${r.name}${r.index}': constant index must be smaller than ${maxConstants}`);
        }
    }
    else if (r.index >= maxRegisters) {
        throw new Error(`Invalid register reference '${r.name}${r.index}': register index must be smaller than ${maxRegisters}`);
    }
}

function validateVariableName(variable: string) {
    variable = variable.trim();
    const match = variable.match(vNamePattern);
    if (!match) {
        throw new Error(`Variable name '${variable}' is invalid`);
    }
    else if (match[0].length !== variable.length) {
        throw new Error(`Variable name '${variable}' is invalid`);
    }
    return variable;
}

function validateVariableReference(v: VariableNode, variables: Set<string>) {
    if (!variables.has(v.name)) {
        throw new Error(`Variable '${v.name}' is not defined`);
    }
}