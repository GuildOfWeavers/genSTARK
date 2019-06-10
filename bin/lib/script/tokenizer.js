"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// MODULE VARIABLES
// ================================================================================================
exports.matchers = [
    { type: 'space', match: /^\s+/ },
    { type: 'literal', match: /^(\d+)/ },
    { type: 'register', match: /^[nrk]\d{1,2}/ },
    { type: 'variable', match: /^[abcdef]\d{1,2}/ },
    { type: 'paren', match: /^[\(\)]/ },
    { type: 'bracket', match: /^[\[\]]/ },
    { type: 'operator', match: /^[\+\-\*\/\^\#]/ },
    { type: 'comma', match: /^[,]/ },
];
// PUBLIC FUNCTIONS
// ================================================================================================
function tokenize(expression, skipWhitespace) {
    const tokens = [];
    let remainder = expression;
    while (remainder) {
        let next = Token.read(remainder);
        if (!skipWhitespace || next.token.type !== 'space') {
            tokens.push(next.token);
        }
        remainder = next.remainder;
    }
    return tokens;
}
exports.tokenize = tokenize;
// TOKEN CLASS
// ================================================================================================
class Token {
    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(type, value) {
        this.type = type;
        this.value = value;
    }
    // PUBLIC FUNCTIONS
    // --------------------------------------------------------------------------------------------
    static read(expression) {
        const matcher = exports.matchers.find(m => m.match.test(expression));
        if (!matcher)
            throw new Error('Expression contains an invalid token');
        const token = new Token(matcher.type, expression.match(matcher.match)[0]);
        return { token, remainder: expression.slice(token.value.length) };
    }
}
exports.Token = Token;
//# sourceMappingURL=tokenizer.js.map