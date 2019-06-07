"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const tokenizer_1 = require("./tokenizer");
const parser_1 = require("./parser");
const nodes_1 = require("./nodes");
// MODULE VARABLES
// ================================================================================================
exports.symScript = Symbol('script');
const vNamePattern = tokenizer_1.matchers.find(m => m.type === 'variable').match;
// PUBLIC FUNCTIONS
// ================================================================================================
function parseScript(script, maxRegisters, maxConstants) {
    const statements = script.split(';');
    const variables = new Set();
    const expressions = new Array();
    for (let i = 0; i < statements.length; i++) {
        let statement = statements[i].trim();
        if (statement.length === 0)
            continue;
        let [variable, expression] = statement.split(':');
        variable = validateVariableName(variable);
        variables.add(variable);
        expressions.push([variable, parseExpression(expression, variables, maxRegisters, maxConstants)]);
    }
    return new Script(variables, expressions);
}
exports.parseScript = parseScript;
function parseExpression(expression, variables, maxRegisters, maxConstants) {
    const tokens = tokenizer_1.tokenize(expression, true);
    // convert registers, variables, literals to AST nodes
    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        if (token.type === 'register') {
            tokens[i] = new nodes_1.RegisterNode(token.value);
            validateRegisterIndex(tokens[i], maxRegisters, maxConstants);
        }
        else if (token.type === 'variable') {
            tokens[i] = new nodes_1.VariableNode(token.value);
            validateVariableReference(tokens[i], variables);
        }
        else if (token.type === 'literal') {
            tokens[i] = new nodes_1.LiteralNode(token.value);
        }
    }
    const ast = parser_1.parseOperations(tokens);
    return ast;
}
exports.parseExpression = parseExpression;
// SCRIPT CLASS DEFINITION
// ================================================================================================
class Script {
    constructor(variables, statments) {
        this.variables = variables;
        this.statements = statments;
    }
    toCode(regRefBuilder) {
        let code = `let ${Array.from(this.variables).join(',')};\n`;
        for (let statment of this.statements) {
            let variable = statment[0];
            let expression = statment[1];
            code += `${variable} = ${expression.toCode(regRefBuilder)};\n`;
        }
        return code;
    }
}
exports.Script = Script;
// HELPER FUNCTIONS
// ================================================================================================
function validateRegisterIndex(r, maxRegisters, maxConstants) {
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
function validateVariableName(variable) {
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
function validateVariableReference(v, variables) {
    if (!variables.has(v.name)) {
        throw new Error(`Variable '${v.name}' is not defined`);
    }
}
//# sourceMappingURL=index.js.map