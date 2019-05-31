// IMPORTS
// ================================================================================================
import { tokenize } from "./tokenizer";
import { parseOperations } from './parser';
import { RegisterNode, LiteralNode, AstNode } from "./nodes";

// RE-EXPORTS
// ================================================================================================
export { AstNode } from './nodes';

// PUBLIC FUNCTIONS
// ================================================================================================
export function parseExpression(expression: string, maxRegisters: number, maxConstants: number): AstNode {
    const tokens: any[] = tokenize(expression, true);

    // convert registers and literals to AST nodes
    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        if (token.type === 'register') {
            tokens[i] = new RegisterNode(token.value);
            validateRegisterIndex(tokens[i], maxRegisters, maxConstants);
        } else if (token.type === 'literal') {
            tokens[i] = new LiteralNode(token.value);
        }
    }

    const ast = parseOperations(tokens);
    return ast;
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