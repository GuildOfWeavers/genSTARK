// IMPORTS
// ================================================================================================
import {
    StarkConfig, TransitionFunction, ConstraintEvaluator, BatchConstraintEvaluator, HashAlgorithm, 
    Constant, ConstantPattern
} from '@guildofweavers/genstark';
import { Script } from './script';
import { isPowerOf2 } from './utils';

// MODULE VARIABLES
// ================================================================================================
export const MAX_DOMAIN_SIZE = 2**32;

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
const CONSTANT_PATTERNS: ConstantPattern[] = ['repeat', 'spread'];

// PUBLIC FUNCTIONS
// ================================================================================================
export function parseStarkConfig(config: StarkConfig) {
    if (!config) throw new TypeError('STARK config was not provided');

    // field
    if (!config.field) throw new TypeError('Finite field was not provided');

    // constants
    const constants: Constant[] = [];
    if (config.constants) {
        if (!Array.isArray(constants)) throw new TypeError(`Constant definitions must be in an array`);
        if (config.constants.length > MAX_CONSTANT_COUNT) {
            throw new TypeError(`Number of constant definitions cannot exceed ${MAX_CONSTANT_COUNT}`);
        }

        for (let i = 0; i < config.constants.length; i++) {
            let constant = config.constants[i];
            if (!constant) throw new TypeError(`Constant definition at position ${i} is undefined`);
            if (!CONSTANT_PATTERNS.includes(constant.pattern)) {
                throw new TypeError(`Constant pattern ${constant.pattern} is invalid`)
            }

            if (!Array.isArray(constant.values)) throw new TypeError(`Values for constant definition ${i} are invalid`);
            if (!isPowerOf2(constant.values.length)) {
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
    if (!config.tFunction) throw new TypeError('Transition function script was not provided');
    if (typeof config.tFunction !== 'string') throw new TypeError('Transition function script must be a string');
    let tFunction: TransitionFunction, registerCount: number;
    try {
        const tFunctionScript = new Script(config.tFunction, constantCount);
        registerCount = tFunctionScript.outputWidth;
        if (registerCount > MAX_REGISTER_COUNT) {
            throw new TypeError(`Number of state registers cannot exceed ${MAX_REGISTER_COUNT}`);
        }
        tFunction = buildTransitionFunction(tFunctionScript);
    }
    catch (error) {
        throw new Error(`Failed to build transition function: ${error.message}`);
    }
    
    // transition constraints
    if (!config.tConstraints) throw new TypeError('Transition constraints script was not provided');
    if (typeof config.tConstraints !== 'string') throw new TypeError('Transition constraints script must be a string');
    let tBatchConstraintEvaluator: BatchConstraintEvaluator, tConstraintEvaluator: ConstraintEvaluator, constraintCount: number;
    try {
        const tConstraintsScript = new Script(config.tConstraints, constantCount, registerCount);
        constraintCount = tConstraintsScript.outputWidth;
        if (constraintCount > MAX_CONSTRAINT_COUNT) {
            throw new TypeError(`Number of transition constraints cannot exceed ${MAX_CONSTRAINT_COUNT}`);
        }
        tBatchConstraintEvaluator = buildBatchConstraintEvaluator(tConstraintsScript);
        tConstraintEvaluator = buildConstraintEvaluator(tConstraintsScript);
    }
    catch (error) {
        throw new Error(`Failed to build transition constraints script: ${error.message}`);
    }

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
        field               : config.field,
        registerCount       : registerCount,
        constraintCount     : constraintCount,
        tFunction           : tFunction,
        tConstraints: {
            evaluator       : tConstraintEvaluator,
            batchEvaluator  : tBatchConstraintEvaluator,
            maxDegree       : tConstraintDegree
        },
        constants           : constants,
        extensionFactor     : extensionFactor,
        exeSpotCheckCount   : exeSpotCheckCount,
        friSpotCheckCount   : friSpotCheckCount,
        hashAlgorithm       : hashAlgorithm
    };
}

// HELPER FUNCTIONS
// ================================================================================================
function buildTransitionFunction(script: Script): TransitionFunction {

    const registerCount = script.outputWidth;
    const assignments = new Array<string>(registerCount);
    
    const regRefBuilder = function(name: string, index: number): string {
        if (name === '$n') {
            throw new Error('Transition function script cannot reference future register states');
        }
        else if (name === '$r') {
            return `$r[${index}][$i]`;
        }
        else if (name === '$k') {
            return `$k[${index}].getValue($i, true)`;
        }
        throw new Error(`Register reference '${name}${index}' is invalid`);
    };

    const scriptCode = script.toCode(regRefBuilder);
    for (let i = 0; i < registerCount; i++) {
        assignments[i] = `$r[${i}][$i+1] = ${script.outputVariableName}[${i}]`;
    }

    const cBody = `throw new Error('Error in transition function at step ' + $i + ':' + error.message);`;
    const lBody = `for (; $i < $steps - 1; $i++) {\n${scriptCode}\n${assignments.join(';\n')};\n}`;
    const fBody = `let $i = 0;\ntry {\n${lBody}\n}\ncatch(error){\n${cBody}\n}`;
    return new Function('$r', '$k', '$steps', '$field', fBody) as TransitionFunction;
}

function buildBatchConstraintEvaluator(script: Script): BatchConstraintEvaluator {

    const constraintCount = script.outputWidth;
    const assignments = new Array<string>(constraintCount);
    const validators = new Array<string>(constraintCount);
    
    const regRefBuilder = function(name: string, index: number): string {
        if (name === '$n') {
            return `$r[${index}][($i + $skip) % $steps]`;
        }
        else if (name === '$r') {
            return `$r[${index}][$i]`;
        }
        else if (name === '$k') {
            return `$k[${index}].getValue($i, false)`;
        }
        throw new Error(`Register reference '${name}${index}' is invalid`);
    };

    const scriptCode = script.toCode(regRefBuilder);
    for (let i = 0; i < constraintCount; i++) {
        assignments[i] = `$q[${i}][$i] = ${script.outputVariableName}[${i}]`;
        validators[i] = `if ($q[${i}][$i] !== 0n) throw new Error('Constraint ' + ${i} + ' didn\\'t evaluate to 0 at step: ' + ($i/$skip));`;
    }

    const cBody = `if ($i < $nfSteps && $i % $skip === 0) {\n${validators.join(';\n')}\n}`;
    const lBody = `${scriptCode}\n${assignments.join(';\n')};\n${cBody}`
    const fBody = `const $nfSteps = $steps - $skip;\nfor (let $i = 0; $i < $steps; $i++) {\n${lBody}\n}`;
    return new Function('$q', '$r', '$k', '$steps', '$skip', '$field', fBody) as BatchConstraintEvaluator;
}

function buildConstraintEvaluator(script: Script): ConstraintEvaluator {

    const regRefBuilder = function(name: string, index: number): string {
        return `${name}[${index}]`;
    }

    const scriptCode = script.toCode(regRefBuilder);
    const body = `${scriptCode}\nreturn ${script.outputVariableName};`;
    return new Function('$r', '$n', '$k', '$field', body) as ConstraintEvaluator;
}