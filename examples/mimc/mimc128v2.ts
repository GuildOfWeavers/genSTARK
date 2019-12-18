// IMPORTS
// ================================================================================================
import * as assert from 'assert';
import { StarkOptions, FiniteField } from '@guildofweavers/genstark';
import { instantiate } from '../../index';
import { Logger } from '../../lib/utils';
import { prng } from '@guildofweavers/air-assembly';

// STARK DEFINITION
// ================================================================================================
const steps = 2**13;
const constantCount = 64;
const seed = 3n;

// define security options for the STARK
const options: StarkOptions = {
    hashAlgorithm   : 'blake2s256',
    extensionFactor : 16,
    exeQueryCount   : 48,
    friQueryCount   : 24,
    wasm            : true
};

// create the STARK for MiMC computation
// TODO: update
const mimcStark = instantiate(Buffer.from(`
(module
    (field prime 340282366920938463463374607393113505793)
    (const 
        (scalar 3))
    (static
        (input secret vector (steps ${steps}) (shift -1))
        (mask inverted (input 0))
        (cycle (prng sha256 0x4d694d43 ${constantCount})))
    (transition
        (span 1) (result vector 1)
        (local vector 1)
        (store.local 0 
			(add 
				(exp (load.trace 0) (load.const 0))
                (get (load.static 0) 2)))
        (add
            (mul (load.local 0)	(get (load.static 0) 1))
			(get (load.static 0) 0)
        )
    )
    (evaluation
        (span 2) (result vector 1)
		(local vector 1)
        (store.local 0 
			(add 
				(exp (load.trace 0) (load.const 0))
                (get (load.static 0) 2)))
        (sub
            (load.trace 1)
            (add
				(mul (load.local 0)	(get (load.static 0) 1))
				(get (load.static 0) 0))
		)
	)
    (export main (init seed) (steps ${steps})))`
), 'mimc', options, new Logger(false));

// TESTING
// ================================================================================================
// generate control values
const controls = runMimc(mimcStark.air.field, steps, constantCount, seed);

// set up inputs and assertions
const assertions = [
    { step: 0, register: 0, value: controls[0] },                   // value at first step is equal to input
    { step: steps - 1, register: 0, value: controls[steps - 1] }    // value at last step is equal to result
];

// prove that the assertions hold if we execute MiMC computation with given inputs
let proof = mimcStark.prove(assertions, [[seed]], [seed]);
console.log('-'.repeat(20));

// serialize the proof
let start = Date.now();
const buf = mimcStark.serialize(proof);
console.log(`Proof serialized in ${Date.now() - start} ms; size: ${Math.round(buf.byteLength / 1024 * 100) / 100} KB`);
assert(buf.byteLength === mimcStark.sizeOf(proof));
console.log('-'.repeat(20));

// deserialize the proof to make sure everything serialized correctly
start = Date.now();
proof = mimcStark.parse(buf);
console.log(`Proof parsed in ${Date.now() - start} ms`);
console.log('-'.repeat(20));

// verify the proof
mimcStark.verify(assertions, proof);
console.log('-'.repeat(20));
console.log(`STARK security level: ${mimcStark.securityLevel}`);

// MiMC FUNCTION
// ================================================================================================
function runMimc(field: FiniteField, steps: number, constCount: number, seed: bigint): bigint[] {
    // build round constants
    const roundConstants = prng.sha256(Buffer.from('4d694d43', 'hex'), constCount, field);

    const result = [seed];
    for (let i = 0; i < steps - 1; i++) {
        let value = field.add(field.exp(result[i], 3n), roundConstants[i % roundConstants.length]);
        result.push(value);
    }

    return result;
}