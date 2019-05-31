"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const tokenizer_1 = require("./tokenizer");
const parser_1 = require("./parser");
const nodes_1 = require("./nodes");
// PUBLIC FUNCTIONS
// ================================================================================================
function parseExpression(expression, maxRegisters, maxConstants) {
    const tokens = tokenizer_1.tokenize(expression, true);
    // convert registers and literals to AST nodes
    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        if (token.type === 'register') {
            tokens[i] = new nodes_1.RegisterNode(token.value);
            validateRegisterIndex(tokens[i], maxRegisters, maxConstants);
        }
        else if (token.type === 'literal') {
            tokens[i] = new nodes_1.LiteralNode(token.value);
        }
    }
    const ast = parser_1.parseOperations(tokens);
    return ast;
}
exports.parseExpression = parseExpression;
// HELPER FUNCTIONS
// ================================================================================================
function validateRegisterIndex(r, maxRegisters, maxConstants) {
    if (r.isReadonly && r.index >= maxConstants) {
        if (maxConstants === 0) {
            throw new Error(`Invalid constant reference '${r.name}${r.index}': no constants have been defined`);
        }
        else {
            throw new Error(`Invalid constant reference '${r.name}${r.index}': constant index must be smaller than ${maxConstants}`);
        }
    }
    else if (r.index >= maxRegisters) {
        throw new Error(`Invalid register reference '${r.name}${r.index}': register index must be smaller than ${maxRegisters}`);
    }
}
//# sourceMappingURL=index.js.map