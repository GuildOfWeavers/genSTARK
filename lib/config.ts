// IMPORTS
// ================================================================================================
import { FiniteField, HashAlgorithm } from '@guildofweavers/genstark';
import { isPowerOf2 } from './utils';
import { parse as parseExpression } from './expressions/parser';

interface StarkConfig {
    field               : FiniteField;
    constantCount?      : number;
    tFunction           : { [register: string]: string };
    tConstraints        : string[];
    tConstraintDegree   : number;
    extensionFactor?    : number;
    exeSpotCheckCount?  : number;
    friSpotCheckCount?  : number;
    hashAlgorithm?      : HashAlgorithm;
}

interface TransitionFunction {
    (r: bigint[][], k: bigint[][], steps: number, field: FiniteField): void;
}

interface TransitionConstraints {
    (q: bigint[][], r: bigint[][], k: bigint[][], steps: number, field: FiniteField): void;
}

// MODULE VARIABLES
// ================================================================================================
const MAX_REGISTER_COUNT = 64;
const MAX_CONSTANT_COUNT = 64;
const MAX_CONSTRAINT_COUNT = 1024;
const MAX_CONSTRAINT_DEGREE = 16;
const MAX_EXTENSION_FACTOR = 32;
const MAX_EXE_SPOT_CHECK_COUNT = 128;
const MAX_FRI_SPOT_CHECK_COUNT = 64;

const DEFAULT_EXE_SPOT_CHECK_COUNT = 80;
const DEFAULT_FRI_SPOT_CHECK_COUNT = 40;

const HASH_ALGORITHMS: HashAlgorithm[] = ['sha256', 'blake2s256'];

// PUBLIC FUNCTIONS
// ================================================================================================
export function parseStarkConfig(config: StarkConfig) {
    if (!config) throw new TypeError('STARK config was not provided');

    // field
    if (!config.field) throw new TypeError('Finite field was not provided');

    // constants
    const constantCount = config.constantCount || 0;
    if (constantCount < 0 || constantCount > MAX_CONSTANT_COUNT || !Number.isInteger(constantCount)) {
        throw new TypeError(`Number of state constants must be an integer between 0 and ${MAX_CONSTANT_COUNT}`);
    }

    // transition constraints degree
    const tConstraintDegree = config.tConstraintDegree;
    if (tConstraintDegree < 1 || tConstraintDegree > MAX_CONSTRAINT_DEGREE || !Number.isInteger(tConstraintDegree)) {
        throw new TypeError(`Transition constraint degree must be an integer between 1 and ${MAX_CONSTRAINT_DEGREE}`);
    }
    
    // extension factor
    let extensionFactor = config.extensionFactor;
    if (extensionFactor === undefined) {
        extensionFactor = 2**Math.ceil(Math.log2(tConstraintDegree * 2));
    }
    else {
        if (extensionFactor < 2 || extensionFactor > MAX_EXTENSION_FACTOR || !Number.isInteger(extensionFactor)) {
            throw new TypeError(`Extension factor must be an integer between 2 and ${MAX_EXTENSION_FACTOR}`);
        }
    
        if (!isPowerOf2(extensionFactor)) {
            throw new TypeError(`Extension factor must be a power of 2`);
        }

        if (extensionFactor < 2 * tConstraintDegree) {
            throw new TypeError(`Extension factor must be at least 2x greater than the transition constraint degree`);
        }
    }

    // transition function
    if (!config.tFunction) throw new TypeError('Transition function was not provided');
    const tExpressions = new Map(Object.entries(config.tFunction));
    const registerCount = tExpressions.size;
    if (registerCount === 0) {
        throw new TypeError('At least one register must be defined in transition function');
    }
    if (registerCount > MAX_REGISTER_COUNT) {
        throw new TypeError(`Number of state registers cannot exceed ${MAX_REGISTER_COUNT}`);
    }
    const tFunction = buildTransitionFunction(tExpressions, constantCount);
    
    // transition constraints
    if (!config.tConstraints) throw new TypeError('Transition constraints array was not provided');
    const cExpressions = config.tConstraints;
    if (Array.isArray(!cExpressions)) {
        throw new TypeError('Transition constraints must be provided as an array');
    }
    const constraintCount = cExpressions.length;
    if (constraintCount === 0) throw new TypeError('Transition constraints array was empty');
    if (constraintCount > MAX_CONSTRAINT_COUNT) {
        throw new TypeError(`Number of transition constraints cannot exceed ${MAX_CONSTRAINT_COUNT}`);
    }
    const tConstraints = buildTransitionConstraints(cExpressions, registerCount, constantCount, extensionFactor);

    // execution trace spot checks
    const exeSpotCheckCount = config.exeSpotCheckCount || DEFAULT_EXE_SPOT_CHECK_COUNT;
    if (exeSpotCheckCount < 1 || exeSpotCheckCount > MAX_EXE_SPOT_CHECK_COUNT || !Number.isInteger(exeSpotCheckCount)) {
        throw new TypeError(`Execution sample size must be an integer between 1 and ${MAX_EXE_SPOT_CHECK_COUNT}`);
    }

    // low degree evaluation spot checks
    const friSpotCheckCount = config.friSpotCheckCount || DEFAULT_FRI_SPOT_CHECK_COUNT;
    if (friSpotCheckCount < 1 || friSpotCheckCount > MAX_FRI_SPOT_CHECK_COUNT || !Number.isInteger(friSpotCheckCount)) {
        throw new TypeError(`FRI sample size must be an integer between 1 and ${MAX_FRI_SPOT_CHECK_COUNT}`);
    }

    const hashAlgorithm = config.hashAlgorithm || 'sha256';
    if (!HASH_ALGORITHMS.includes(hashAlgorithm)) {
        throw new TypeError(`Hash algorithm ${hashAlgorithm} is not supported`);
    }

    return {
        field               : config.field,
        registerCount       : registerCount,
        constantCount       : constantCount,
        constraintCount     : constraintCount,
        tFunction           : tFunction,
        tConstraints        : tConstraints,
        tConstraintDegree   : tConstraintDegree,
        extensionFactor     : extensionFactor,
        exeSpotCheckCount   : exeSpotCheckCount,
        friSpotCheckCount   : friSpotCheckCount,
        hashAlgorithm       : hashAlgorithm
    };
}

// HELPER FUNCTIONS
// ================================================================================================
function buildTransitionFunction(expressions: Map<string,string>, constantCount: number): TransitionFunction {

    const registerCount = expressions.size;
    const assignments = new Array<string>(registerCount);
    
    const regRefBuilder = function(name: string, index: number) {
        if (name === 'n') throw new Error('Transition expression cannot use next register state');
        if (index < 0) throw new Error(`Invalid register or constant reference '${name}${index}'`);
        if (name === 'r' && index >= registerCount) {
            throw new Error(``); // TODO
        }
        if (name === 'k' && index >= constantCount) {
            throw new Error(``); // TODO
        }

        return `${name}[${index}][i]`;
    };

    for (let i = 0; i < registerCount; i++) {
        let expression = expressions.get(`n${i}`);
        if (!expression) throw new Error('Missing register'); // TODO: better error
        let ast = parseExpression(expression);
        assignments[i] = `r[${i}][i+1] = ${ast.toCode(regRefBuilder)}`;
    }

    const body = `
        for (let i = 0; i < steps; i++) {
            ${assignments.join(';\n')};
        }`;

    return new Function('r', 'k', 'steps', 'field', body) as TransitionFunction;
}

function buildTransitionConstraints(expressions: string[], registerCount: number, constantCount: number, extensionFactor: number): TransitionConstraints {

    const constraintCount = expressions.length;
    const constraints = new Array<string>(constraintCount);
    
    const regRefBuilder = function(name: string, index: number) {
        if (index < 0) throw new Error(`Invalid register or constant reference '${name}${index}'`);
        if ((name === 'r' || name === 'n') && index >= registerCount) {
            throw new Error(``); // TODO
        }
        if (name === 'k' && index >= constantCount) {
            throw new Error(``); // TODO
        }

        return (name === 'n')
            ? `r[${index}][(i+${extensionFactor}) % steps]`
            : `${name}[${index}][i]`;
    };

    for (let i = 0; i < constraintCount; i++) {
        let expression = expressions[i];
        if (!expression) throw new Error('Invalid constraint'); // TODO: better error
        let ast = parseExpression(expression);
        constraints[i] = `q[${i}][i] = ${ast.toCode(regRefBuilder)}`;
    }

    const body = `
        for (let i = 0; i < steps; i++) {
            ${constraints.join(';\n')};
        }`;

    return new Function('q', 'r', 'k', 'steps', 'field', body) as TransitionConstraints;
}