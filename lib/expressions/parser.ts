// IMPORTS
// ================================================================================================
import { OperationNode, LiteralNode } from "./nodes";

// PUBLIC FUNCTIONS
// ================================================================================================
export function parseOperations(tokens: any[]): any {
    let result = pullSubExpressions(tokens);
    if (result.length === 0) return [];
    
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
    result = pullOperators(['*', '/'], result);
    result = pullOperators(['+', '-'], result);

    if (result.length !== 1) throw new Error('Expression evaluated to more than one root');
    return result[0];
}

// HELPER FUNCTIONS
// ================================================================================================
function pullSubExpressions(tokens: any[]) {
    let parenDepth = 0;
    let subExprTokens: any[];
    let output = [];

    for (let i = 0; i < tokens.length; i++) {
        let token = tokens[i];
        if (parenDepth === 0) {
            if (token.type === 'paren') {
                if (token.value === ')') throw new Error('Unexpected close parenthesis ")"');
                parenDepth += 1;
                subExprTokens = [];
            } else {
                output.push(token);
            }
        } else {
            if (token.type === 'paren') {
                parenDepth += ((token.value === '(') ? +1 : -1);
                if (parenDepth === 0) {
                    let subAST = parseOperations(subExprTokens!);
                    output.push(subAST);
                } else {
                    subExprTokens!.push(token);
                }
            } else {
                subExprTokens!.push(token);
            }
        }
    }
    if (parenDepth !== 0) { throw new Error('Unclosed parenthesis'); }
    return output;
}

function pullOperators(operators: string[], tokens: any[]) {
    const output: any[] = [];
    let processed: any[] = [[], null];

    while (true) {
        let [ tL, t, tR] = getTrio(processed[0]!, tokens);
        if (!t) {
            if (tR) { output.unshift(tR); }
            break;
        }

        // process the operator
        if (t.type === 'operator' && operators.includes(t.value)) {
            let node;
            
            // convert unary '-x' to binary '0 - x', unless x is a literal
            if (t.value === '-' && tL === undefined) {
                if (tR && tR instanceof LiteralNode) {
                    node = new LiteralNode(`-${tR.value}`);
                }
                else {
                    tL = new LiteralNode('0');
                }
            }

            // if unary '-' hasn't been collapsed into a literal, create an operation node
            if (!node) {
                assertNotOpToken([tL, tR]);
                node = new OperationNode(t.value, [tL, tR]);
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
};

function getTrio(remainder: any[], tokens: any[]) {
    const result = [
        remainder.pop() || tokens.pop(),
        remainder.pop() || tokens.pop(),
        remainder.pop() || tokens.pop()
    ];
    return result.reverse();
};

function assertNotOpToken(tokens: any[]) {
    for (let token of tokens) {
        if (token && token.type === 'operator') {
            throw new Error(`Sequential operator: ${token.value}`);
        }
    }
}