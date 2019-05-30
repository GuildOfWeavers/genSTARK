"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const Token_1 = require("./Token");
const nodes_1 = require("./nodes");
// PUBLIC FUNCTIONS
// ================================================================================================
function parse(expression) {
    const tokens = tokenize(expression, true);
    const ast = processTokens(tokens);
    return ast;
}
exports.parse = parse;
// HELPER FUNCTIONS
// ================================================================================================
function tokenize(expression, skipWhitespace) {
    const tokens = [];
    let remainder = expression;
    while (remainder) {
        let next = Token_1.Token.read(remainder);
        if (!skipWhitespace || next.token.type !== 'space') {
            tokens.push(next.token);
        }
        remainder = next.remainder;
    }
    return tokens;
}
function processTokens(tokens) {
    let result = pullSubExpressions(tokens);
    if (result.length === 0)
        return [];
    // validate operators
    const first = result[0];
    if (first.type === 'operator' && first.value !== '-') {
        throw new Error(`non-unary leading operator: ${first.value}`);
    }
    const last = result[result.length - 1];
    if (last.type === 'operator') {
        throw new Error(`trailing operator: ${last.value}`);
    }
    // convert registers and literals to AST nodes
    for (let i = 0; i < result.length; i++) {
        let token = result[i];
        if (token.type === 'register') {
            result[i] = new nodes_1.RegisterNode(token.value);
        }
        else if (token.type === 'literal') {
            result[i] = new nodes_1.LiteralNode(token.value);
        }
    }
    // process binary (and unary '-') operators in order of precedence
    result = processOperator(['^'], result);
    result = processOperator(['*', '/'], result);
    result = processOperator(['+', '-'], result);
    if (result.length !== 1)
        throw new Error('Incorrect result'); // TODO: better error
    return result[0];
}
function pullSubExpressions(tokens) {
    let parenDepth = 0, subExprTokens, output = [];
    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        if (parenDepth === 0) {
            if (token.type === 'paren') {
                if (token.value === ')')
                    throw new Error('Unexpected close parenthesis ")"');
                parenDepth += 1;
                subExprTokens = [];
            }
            else {
                output.push(token);
            }
        }
        else {
            if (token.type === 'paren') {
                parenDepth += ((token.value === '(') ? +1 : -1);
                if (parenDepth === 0) {
                    let subAST = processTokens(subExprTokens);
                    output.push(subAST);
                }
                else {
                    subExprTokens.push(token);
                }
            }
            else {
                subExprTokens.push(token);
            }
        }
    }
    if (parenDepth !== 0) {
        throw new Error('Unclosed parenthesis');
    }
    return output;
}
function processOperator(operators, tokens) {
    const output = [];
    let processed = [[], null];
    while (true) {
        let [tL, t, tR] = getTrio(processed[0], tokens);
        if (!t) {
            if (tR) {
                output.unshift(tR);
            }
            break;
        }
        // process the operator
        if (t.type === 'operator' && operators.includes(t.value)) {
            // convert unary '-x' to binary '0 - x'
            if (t.value === '-' && tL === undefined) {
                tL = new nodes_1.LiteralNode('0');
            }
            assertNotOpToken([tL, tR]);
            let node = new nodes_1.OperationNode(t.value, [tL, tR]);
            processed = [[node], null];
        }
        else {
            processed = [[tL, t], tR];
        }
        if (processed[1] !== null) {
            output.unshift(processed[1]);
        }
    }
    return output;
}
;
function getTrio(remainder, tokens) {
    const result = [
        remainder.pop() || tokens.pop(),
        remainder.pop() || tokens.pop(),
        remainder.pop() || tokens.pop()
    ];
    return result.reverse();
}
;
function assertNotOpToken(tokens) {
    for (let token of tokens) {
        if (token && token.type === 'operator') {
            throw new Error(`Sequential operator: ${token.value}`);
        }
    }
}
//# sourceMappingURL=parser.js.map