"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// MODULE VARIABLES
// ================================================================================================
const matchers = [
    { type: 'space', match: /^\s+/ },
    { type: 'literal', match: /^(\d+)/ },
    { type: 'register', match: /^[nrk]\d{1,2}/ },
    { type: 'paren', match: /^[\(\)]/ },
    { type: 'operator', match: /^[\+\-\*\/\^]/ }
];
// CLASS DEFINITION
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
        const matcher = matchers.find(m => m.match.test(expression));
        if (!matcher)
            throw new Error('Invalid token'); // TODO: better error
        const token = new Token(matcher.type, expression.match(matcher.match)[0]);
        return { token, remainder: expression.slice(token.value.length) };
    }
}
exports.Token = Token;
//# sourceMappingURL=Token.js.map