"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const tokenizer_1 = require("./tokenizer");
const parsers_1 = require("./parsers");
const utils_1 = require("./utils");
// MODULE VARIABLE
// ================================================================================================
exports.OUTPUT_NAME = 'out';
// CLASS DEFINITION
// ================================================================================================
class Script {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(text, maxConstants, maxRegisters) {
        const statements = text.trim().split(';');
        this.variables = new Map();
        this.statements = new Array();
        // remove out statement from the script
        const outStatement = popOutStatement(statements);
        // parse body statements
        for (let i = 0; i < statements.length; i++) {
            try {
                let statement = statements[i].trim();
                if (statement.length === 0)
                    continue;
                let parts = statement.split(':');
                if (parts.length === 1)
                    throw new Error(`Missing assignment operator ':'`);
                if (parts.length > 2)
                    throw new Error(`Too many assignment operators ':'`);
                // tokenize the statement
                let tokens = tokenizer_1.tokenize(parts[1], true);
                if (tokens.length === 0)
                    throw new Error(`Assignment expression cannot be empty`);
                // convert tokens into an expression
                let expression = (tokens[0].type === 'bracket')
                    ? parseVectorOrMatrix(tokens, this.variables)
                    : parsers_1.parseExpression(tokens, this.variables);
                // validate variable name
                let variable = addVariable(parts[0], expression.dimensions, this.variables);
                // add the processed statement to the list
                this.statements.push([variable, expression]);
            }
            catch (error) {
                throw new Error(`Statement ${i + 1} is malformed: ${error.message}`);
            }
        }
        // parse out statement
        try {
            const tokens = tokenizer_1.tokenize(outStatement, true);
            if (tokens.length === 0)
                throw new Error(`statement cannot be empty`);
            const expression = (tokens[0].type === 'bracket')
                ? parseVectorOrMatrix(tokens, this.variables)
                : parsers_1.parseExpression(tokens, this.variables);
            if (utils_1.isMatrix(expression.dimensions)) {
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
    get outputWidth() {
        return this.output.dimensions[0];
    }
    get outputVariableName() {
        return exports.OUTPUT_NAME;
    }
    // PUBLIC METHODS
    // --------------------------------------------------------------------------------------------
    toCode(regRefBuilder) {
        // variable declaration
        let code = `let ${exports.OUTPUT_NAME}`;
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
        if (utils_1.isVector(this.output.dimensions)) {
            code += `${exports.OUTPUT_NAME} = ${this.output.toCode(regRefBuilder)};`;
        }
        else {
            code += `${exports.OUTPUT_NAME} = [${this.output.toCode(regRefBuilder)}];`;
        }
        return code;
    }
}
exports.Script = Script;
// HELPER FUNCTIONS
// ================================================================================================
function popOutStatement(statements) {
    let outStatement;
    while (statements.length > 0) {
        outStatement = statements.pop();
        if (!outStatement)
            continue;
        let parts = outStatement.split(':');
        if (parts[0].trim() !== exports.OUTPUT_NAME) {
            throw new Error(`A script must terminate with an '${exports.OUTPUT_NAME}:' statement`);
        }
        if (parts.length !== 2 || !parts[1].trim()) {
            throw new Error('Out statement is malformed');
        }
        return parts[1].trim();
    }
    throw new Error(`A script must terminate with an '${exports.OUTPUT_NAME}:' statement`);
}
function addVariable(variable, dimensions, variables) {
    variable = variable.trim();
    if (variables.has(variable)) {
        let dim = variables.get(variable);
        if (dim[0] !== dimensions[0] && dim[1] != dimensions[1]) {
            throw new Error(`Dimensions of variable '${variable}' cannot be changed`);
        }
    }
    else {
        utils_1.validateVariableName(variable, dimensions);
        variables.set(variable, dimensions);
    }
    return variable;
}
function parseVectorOrMatrix(tokens, variables) {
    if (tokens[0].value === ']')
        throw new Error('Unexpected close bracket');
    if (tokens.length < 2)
        throw new Error('Unclosed bracket');
    return (tokens[1].type === 'bracket')
        ? parsers_1.parseMatrix(tokens, variables)
        : parsers_1.parseVector(tokens, variables);
}
function validateRegisterReferences(statements, maxRegisters, maxConstants) {
    const regInfoMessage = `register index must be smaller than ${maxRegisters}`;
    const constInfoMessage = (maxConstants === 0)
        ? `no constants have been defined`
        : `constant index must be smaller than ${maxConstants}`;
    for (let i = 0; i < statements.length; i++) {
        let [variable, expression] = statements[i];
        if (expression.maxRegRef >= maxRegisters) {
            throw (variable === exports.OUTPUT_NAME)
                ? new Error(`Invalid register reference out statement: ${regInfoMessage}`)
                : new Error(`Invalid register reference in statement ${i}: ${regInfoMessage}`);
        }
        if (expression.maxConstRef >= maxConstants) {
            throw (variable === exports.OUTPUT_NAME)
                ? new Error(`Invalid constant reference out statement: ${constInfoMessage}`)
                : new Error(`Invalid constant reference in statement ${i}: ${constInfoMessage}`);
        }
    }
}
//# sourceMappingURL=Script.js.map