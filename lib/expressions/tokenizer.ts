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

// PUBLIC FUNCTIONS
// ================================================================================================
export function tokenize(expression: string, skipWhitespace: boolean): Token[] {
    const tokens: Token[] = [];

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

// TOKEN CLASS
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
        if (!matcher) throw new Error('Expression contains an invalid token');
        const token = new Token(matcher.type as TokenType, expression.match(matcher.match)![0]);
        return { token, remainder: expression.slice(token.value.length) };
    }
}