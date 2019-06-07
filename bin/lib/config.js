"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const expressions_1 = require("./expressions");
const utils_1 = require("./utils");
// MODULE VARIABLES
// ================================================================================================
exports.MAX_DOMAIN_SIZE = 2 ** 32;
const MAX_REGISTER_COUNT = 64;
const MAX_CONSTANT_COUNT = 64;
const MAX_CONSTRAINT_COUNT = 1024;
const MAX_CONSTRAINT_DEGREE = 16;
const MAX_EXTENSION_FACTOR = 32;
const MAX_EXE_SPOT_CHECK_COUNT = 128;
const MAX_FRI_SPOT_CHECK_COUNT = 64;
const DEFAULT_EXE_SPOT_CHECK_COUNT = 80;
const DEFAULT_FRI_SPOT_CHECK_COUNT = 40;
const HASH_ALGORITHMS = ['sha256', 'blake2s256'];
const CONSTANT_PATTERNS = ['repeat', 'spread'];
// PUBLIC FUNCTIONS
// ================================================================================================
function parseStarkConfig(config) {
    if (!config)
        throw new TypeError('STARK config was not provided');
    // field
    if (!config.field)
        throw new TypeError('Finite field was not provided');
    // constants
    const constants = [];
    if (config.constants) {
        if (!Array.isArray(constants))
            throw new TypeError(`Constant definitions must be in an array`);
        if (config.constants.length > MAX_CONSTANT_COUNT) {
            throw new TypeError(`Number of constant definitions cannot exceed ${MAX_CONSTANT_COUNT}`);
        }
        for (let i = 0; i < config.constants.length; i++) {
            let constant = config.constants[i];
            if (!constant)
                throw new TypeError(`Constant definition at position ${i} is undefined`);
            if (!CONSTANT_PATTERNS.includes(constant.pattern)) {
                throw new TypeError(`Constant pattern ${constant.pattern} is invalid`);
            }
            if (!Array.isArray(constant.values))
                throw new TypeError(`Values for constant definition ${i} are invalid`);
            if (!utils_1.isPowerOf2(constant.values.length)) {
                throw new TypeError(`Number of values for constant definition ${i} is not a power of 2`);
            }
            for (let j = 0; j < constant.values.length; j++) {
                if (typeof constant.values[j] !== 'bigint') {
                    throw new TypeError(`Value at position ${j} for constant definition ${i} is not a BigInt`);
                }
            }
            constants.push(constant);
        }
    }
    const constantCount = constants.length;
    // transition constraints degree
    const tConstraintDegree = config.tConstraintDegree;
    if (tConstraintDegree < 1 || tConstraintDegree > MAX_CONSTRAINT_DEGREE || !Number.isInteger(tConstraintDegree)) {
        throw new TypeError(`Transition constraint degree must be an integer between 1 and ${MAX_CONSTRAINT_DEGREE}`);
    }
    // extension factor
    let extensionFactor = config.extensionFactor;
    if (extensionFactor === undefined) {
        extensionFactor = 2 ** Math.ceil(Math.log2(tConstraintDegree * 2));
    }
    else {
        if (extensionFactor < 2 || extensionFactor > MAX_EXTENSION_FACTOR || !Number.isInteger(extensionFactor)) {
            throw new TypeError(`Extension factor must be an integer between 2 and ${MAX_EXTENSION_FACTOR}`);
        }
        if (!utils_1.isPowerOf2(extensionFactor)) {
            throw new TypeError(`Extension factor must be a power of 2`);
        }
        if (extensionFactor < 2 * tConstraintDegree) {
            throw new TypeError(`Extension factor must be at least 2x greater than the transition constraint degree`);
        }
    }
    // transition function
    if (!config.tExpressions)
        throw new TypeError('Transition expressions were not provided');
    const tExpressions = new Map(Object.entries(config.tExpressions));
    const registerCount = tExpressions.size;
    if (registerCount === 0) {
        throw new TypeError('At least one register must be defined in transition function');
    }
    if (registerCount > MAX_REGISTER_COUNT) {
        throw new TypeError(`Number of state registers cannot exceed ${MAX_REGISTER_COUNT}`);
    }
    const tFunctionScript = config.tExpressions[expressions_1.symScript];
    const tFunction = buildTransitionFunction(tExpressions, tFunctionScript, constantCount);
    // transition constraints
    if (!config.tConstraints)
        throw new TypeError('Transition constraints were not provided');
    const cExpressions = new Map(Object.entries(config.tConstraints));
    const constraintCount = cExpressions.size;
    if (constraintCount === 0) {
        throw new TypeError('At least one transition constraint must be provided');
    }
    if (constraintCount > MAX_CONSTRAINT_COUNT) {
        throw new TypeError(`Number of transition constraints cannot exceed ${MAX_CONSTRAINT_COUNT}`);
    }
    const tConstraintScript = config.tConstraints[expressions_1.symScript];
    const tConstraints = parseTransitionConstraints(cExpressions, tConstraintScript, registerCount, constantCount);
    const tBatchConstraintEvaluator = buildBatchConstraintEvaluator(tConstraints.expressions, tConstraints.script);
    const tConstraintEvaluator = buildConstraintEvaluator(tConstraints.expressions, tConstraints.script);
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
    // hash function
    const hashAlgorithm = config.hashAlgorithm || 'sha256';
    if (!HASH_ALGORITHMS.includes(hashAlgorithm)) {
        throw new TypeError(`Hash algorithm ${hashAlgorithm} is not supported`);
    }
    return {
        field: config.field,
        registerCount: registerCount,
        constraintCount: constraintCount,
        tFunction: tFunction,
        tConstraints: {
            evaluator: tConstraintEvaluator,
            batchEvaluator: tBatchConstraintEvaluator,
            maxDegree: tConstraintDegree
        },
        constants: constants,
        extensionFactor: extensionFactor,
        exeSpotCheckCount: exeSpotCheckCount,
        friSpotCheckCount: friSpotCheckCount,
        hashAlgorithm: hashAlgorithm
    };
}
exports.parseStarkConfig = parseStarkConfig;
// HELPER FUNCTIONS
// ================================================================================================
function buildTransitionFunction(expressions, script, constantCount) {
    const registerCount = expressions.size;
    const assignments = new Array(registerCount);
    const regRefBuilder = function (name, index) {
        if (name === 'n') {
            throw new Error('Transition expression cannot read next register state');
        }
        else if (name === 'r') {
            return `r[${index}][i]`;
        }
        else if (name === 'k') {
            return `k[${index}].getValue(i, true)`;
        }
        throw new Error(`Register reference '${name}${index}' is invalid`);
    };
    let variables = new Set(), scriptCode = '';
    if (script) {
        try {
            const parsedScript = expressions_1.parseScript(script, registerCount, constantCount);
            variables = parsedScript.variables;
            scriptCode = parsedScript.toCode(regRefBuilder);
        }
        catch (error) {
            throw new Error(`Failed to build transition function script: ${error.message}`);
        }
    }
    let i = 0;
    try {
        for (; i < registerCount; i++) {
            let expression = expressions.get(`n${i}`);
            if (!expression)
                throw new Error('transition expression is undefined');
            let ast = expressions_1.parseExpression(expression, variables, registerCount, constantCount);
            assignments[i] = `r[${i}][i+1] = ${ast.toCode(regRefBuilder)}`;
        }
    }
    catch (error) {
        throw new Error(`Failed to build transition expression for register n${i}: ${error.message}`);
    }
    const cBody = `  throw new Error('Error in transition function at step ' + i + ':' + error.message);`;
    const lBody = `  for (; i < steps - 1; i++) {\n${scriptCode}\n    ${assignments.join(';\n')};\n  }`;
    const fBody = `let i = 0;\ntry {\n${lBody}\n}\ncatch(error){\n${cBody}\n}`;
    return new Function('r', 'k', 'steps', 'field', fBody);
}
function parseTransitionConstraints(expressions, script, registerCount, constantCount) {
    const constraintCount = expressions.size;
    const output = new Array(constraintCount);
    let parsedScript;
    let variables = new Set();
    if (script) {
        try {
            parsedScript = expressions_1.parseScript(script, registerCount, constantCount);
            variables = parsedScript.variables;
        }
        catch (error) {
            throw new Error(`Failed to build transition constraints script: ${error.message}`);
        }
    }
    let i = 0;
    try {
        for (; i < constraintCount; i++) {
            let expression = expressions.get(`q${i}`);
            if (!expression)
                throw new Error('transition constraint is undefined');
            output[i] = expressions_1.parseExpression(expression, variables, registerCount, constantCount);
        }
    }
    catch (error) {
        throw new Error(`Failed to parse transition constraint q${i}: ${error.message}`);
    }
    return { script: parsedScript, expressions: output };
}
function buildBatchConstraintEvaluator(expressions, script) {
    const constraintCount = expressions.length;
    const assignments = new Array(constraintCount);
    const validators = new Array(constraintCount);
    const regRefBuilder = function (name, index) {
        if (name === 'n') {
            return `r[${index}][(i + skip) % steps]`;
        }
        else if (name === 'r') {
            return `r[${index}][i]`;
        }
        else if (name === 'k') {
            return `k[${index}].getValue(i, false)`;
        }
        throw new Error(`Register reference '${name}${index}' is invalid`);
    };
    const scriptCode = script ? script.toCode(regRefBuilder) : '';
    let i = 0;
    try {
        for (; i < constraintCount; i++) {
            assignments[i] = `q[${i}][i] = ${expressions[i].toCode(regRefBuilder)}`;
            validators[i] = `if (q[${i}][i] !== 0n) throw new Error('Constraint ' + ${i} + ' didn\\'t evaluate to 0 at step: ' + (i/skip));`;
        }
    }
    catch (error) {
        throw new Error(`Failed to build transition constraint ${i}: ${error.message}`);
    }
    const cBody = `  if (i < nfSteps && i % skip === 0) {\n    ${validators.join(';\n')}\n  }`;
    const lBody = `  ${scriptCode}\n${assignments.join(';\n')};\n${cBody}`;
    const fBody = `const nfSteps = steps - skip;\nfor (let i = 0; i < steps; i++) {\n${lBody}\n}`;
    return new Function('q', 'r', 'k', 'steps', 'skip', 'field', fBody);
}
function buildConstraintEvaluator(expressions, script) {
    const constraintCount = expressions.length;
    const regRefBuilder = function (name, index) {
        return `${name}[${index}]`;
    };
    const scriptCode = script ? script.toCode(regRefBuilder) : '';
    const assignments = new Array(constraintCount);
    for (let i = 0; i < constraintCount; i++) {
        assignments[i] = `q[${i}] = ${expressions[i].toCode(regRefBuilder)};`;
    }
    const body = `const q = new Array(${constraintCount});\n${scriptCode}\n${assignments.join('\n')}\nreturn q;`;
    return new Function('r', 'n', 'k', 'field', body);
}
//# sourceMappingURL=config.js.map