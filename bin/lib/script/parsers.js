"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// IMPORTS
// ================================================================================================
const nodes_1 = require("./nodes");
// PUBLIC FUNCTIONS
// ================================================================================================
function parseMatrix(tokens, variables) {
    const firstToken = tokens[0], lastToken = tokens[tokens.length - 1];
    if (firstToken.value !== '[')
        throw new Error(`Invalid matrix opening bracket`);
    if (lastToken.value !== ']')
        throw new Error(`Missing matrix closing bracket`);
    // split tokens into rows
    const rows = splitRows(tokens.slice(1, -1));
    // parse each row
    const elements = [];
    for (let row of rows) {
        elements.push(parseElementList(row, variables, 'matrix'));
    }
    return new nodes_1.MatrixNode(elements);
}
exports.parseMatrix = parseMatrix;
function parseVector(tokens, variables) {
    const firstToken = tokens[0], lastToken = tokens[tokens.length - 1];
    if (firstToken.value !== '[')
        throw new Error(`Invalid vector opening bracket`);
    if (lastToken.value !== ']')
        throw new Error(`Missing vector closing bracket`);
    const elements = parseElementList(tokens.slice(1, -1), variables, 'vector');
    return new nodes_1.VectorNode(elements);
}
exports.parseVector = parseVector;
function parseExpression(tokens, variables) {
    // convert registers, variables, literals to AST nodes
    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        if (token.type === 'register') {
            tokens[i] = new nodes_1.RegisterNode(token.value);
        }
        else if (token.type === 'variable') {
            let variableName = token.value;
            if (!variables.has(variableName)) {
                throw new Error(`Variable '${variableName}' is not defined`);
            }
            tokens[i] = new nodes_1.VariableNode(token.value, variables.get(variableName));
        }
        else if (token.type === 'literal') {
            tokens[i] = new nodes_1.LiteralNode(token.value);
        }
        else if (token.type === 'bracket' || token.type === 'comma') {
            throw new Error(`Unexpected token '${token.value}'`);
        }
    }
    const ast = parseOperations(tokens);
    return ast;
}
exports.parseExpression = parseExpression;
// HELPER FUNCTIONS
// ================================================================================================
function parseOperations(tokens) {
    let result = pullSubExpressions(tokens);
    if (result.length === 0)
        return undefined;
    // validate operators
    const first = result[0];
    if (first.type === 'operator' && first.value !== '-') {
        throw new Error(`non-unary leading operator: ${first.value}`);
    }
    const last = result[result.length - 1];
    if (last.type === 'operator') {
        throw new Error(`trailing operator: ${last.value}`);
    }
    // process binary (and unary '-') operators in order of precedence
    result = pullOperators(['^'], result);
    result = pullOperators(['*', '/', '#'], result);
    result = pullOperators(['+', '-'], result);
    if (result.length !== 1)
        throw new Error('Expression evaluated to more than one root');
    return result[0];
}
function pullSubExpressions(tokens) {
    let parenDepth = 0;
    let subExprTokens;
    let output = [];
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
                    let subAST = parseOperations(subExprTokens);
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
function pullOperators(operators, tokens) {
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
            let node;
            // convert unary '-x' to binary '0 - x', unless x is a literal
            if (t.value === '-' && tL === undefined) {
                if (tR && tR instanceof nodes_1.LiteralNode) {
                    node = new nodes_1.LiteralNode(`-${tR.value}`);
                }
                else {
                    tL = new nodes_1.LiteralNode('0');
                }
            }
            // if unary '-' hasn't been collapsed into a literal, create an operation node
            if (!node) {
                assertNotOpToken([tL, tR]);
                node = new nodes_1.OperationNode(t.value, [tL, tR]);
            }
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
function splitRows(tokens) {
    const rows = [];
    let rowTokens = [], depth = 0;
    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        if (token.value === '[') {
            depth++;
        }
        else if (token.value === ']') {
            depth--;
            if (depth === 0) {
                // finished reading row
                i++;
                let nextToken = tokens[i];
                if (nextToken) {
                    if (nextToken.type !== 'comma') {
                        throw new Error(`Unexpected token '${nextToken.value}'`);
                    }
                    else if (i === tokens.length - 1) {
                        throw new Error(`Matrix rows cannot be empty`);
                    }
                }
                rows.push(rowTokens);
                rowTokens = [];
            }
            else {
                rowTokens.push(token);
            }
        }
        else {
            if (depth === 0)
                throw new Error('Missing opening bracket');
            rowTokens.push(token);
        }
    }
    if (depth !== 0)
        throw new TypeError('Unclosed bracket');
    return rows;
}
function parseElementList(tokens, variables, entityName) {
    const elements = [];
    let elementTokens = [];
    for (let i = 0; i < tokens.length; i++) {
        if (tokens[i].type === 'comma') {
            let element = parseExpression(elementTokens, variables);
            if (!element)
                throw new Error(`${entityName} elements cannot be empty`);
            elements.push(element);
            elementTokens = [];
        }
        else {
            elementTokens.push(tokens[i]);
        }
    }
    // process last element
    let element = parseExpression(elementTokens, variables);
    if (!element)
        throw new Error(`${entityName} elements cannot be empty`);
    elements.push(element);
    return elements;
}
//# sourceMappingURL=parsers.js.map