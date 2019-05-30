// INTERFACES
// ================================================================================================
export type TokenType = 'space' | 'literal' | 'register' | 'paren' | 'operator';

// MODULE VARIABLES
// ================================================================================================
const matchers = [
    { type: 'space',    match: /^\s+/ },
    { type: 'literal',  match: /^(\d+)/ },
    { type: 'register', match: /^[nrk]\d{1,2}/ },
    { type: 'paren',    match: /^[\(\)]/ },
    { type: 'operator', match: /^[\+\-\*\/\^]/ }
];

// CLASS DEFINITION
// ================================================================================================
export class Token {

    readonly type   : TokenType;
    readonly value  : string;

    // CONSTRUCTOR
    // --------------------------------------------------------------------------------------------
    constructor(type: TokenType, value: string) {
        this.type = type;
        this.value = value;
    }

    // PUBLIC FUNCTIONS
    // --------------------------------------------------------------------------------------------
    static read(expression: string) {
        const matcher = matchers.find(m => m.match.test(expression));
        if (!matcher) throw new Error('Invalid token'); // TODO: better error
        const token = new Token(matcher.type as TokenType, expression.match(matcher.match)![0]);
        return { token, remainder: expression.slice(token.value.length) };
    }
}