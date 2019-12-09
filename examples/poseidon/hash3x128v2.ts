// IMPORTS
// ================================================================================================
import { instantiate, createPrimeField } from '../../index';
import { StarkOptions } from '@guildofweavers/genstark';
import { getRoundConstants, createHash, transpose } from './utils';

// STARK PARAMETERS
// ================================================================================================
const modulus = 2n**128n - 9n * 2n**32n + 1n;
const field = createPrimeField(modulus);
const stateWidth = 3;
const fRounds = 8;
const pRounds = 55;
const steps = fRounds + pRounds + 1;

const poseidonHash = createHash(field, 5n, fRounds, pRounds, stateWidth);
const result = poseidonHash([42n, 43n]);

const roundConstants = transpose(getRoundConstants(field, stateWidth, steps));

// STARK DEFINITION
// ================================================================================================
const options: StarkOptions = {
    hashAlgorithm   : 'blake2s256',
    extensionFactor : 16,
    exeQueryCount   : 68,
    friQueryCount   : 24,
    wasm            : true
};

const poseidonStark = instantiate(Buffer.from(`
(module
    (field prime ${modulus})
    (const
        (scalar 5)
        (matrix
            (214709430312099715322788202694750992687  54066244720673262921467176400601950806 122144641489288436529811410313120680228)
            ( 83122512782280758906222839313578703456 163244785834732434882219275190570945140  65865044136286518938950810559808473518)
            ( 12333142678723890553278650076570367543 308304933036173868454178201249080175007  76915505462549994902479959396659996669)))
    (static
        (input secret vector (steps 64) (shift -1))
        (input secret vector (steps 64) (shift -1))
        (mask inverted (input 0))
        (cycle 1 1 1 1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 1 1 1 0)
        (cycle ${roundConstants[0].join(' ')})
        (cycle ${roundConstants[1].join(' ')})
        (cycle ${roundConstants[2].join(' ')}))
    (transition
        (span 1) (result vector 3)
        (local vector 3) (local vector 3)
        (store.local 0 
            (prod
                (load.const 1)
                (exp
                    (add (load.trace 0) (slice (load.static 0) 4 6))
                    (load.const 0))))
        (store.local 1
            (prod
                (load.const 1)
                (vector
                    (add (slice (load.trace 0) 0 1) (slice (load.static 0) 4 5))
                    (exp
                        (add (get (load.trace 0) 2) (get (load.static 0) 6))
                        (load.const 0)))))
        (add
            (vector (slice (load.static 0) 0 1) (scalar 0))
            (mul 
                (add
                    (mul (load.local 0) (get (load.static 0) 3))
                    (mul (load.local 1) (sub (scalar 1)  (get (load.static 0) 3))))
                (get (load.static 0) 2)))
    )
    (evaluation
        (span 2) (result vector 3)
		(local vector 3) (local vector 3)
        (store.local 0 
            (prod
                (load.const 1)
                (exp
                    (add (load.trace 0) (slice (load.static 0) 4 6))
                    (load.const 0))))
        (store.local 1
            (prod
                (load.const 1)
                (vector
                    (add (slice (load.trace 0) 0 1) (slice (load.static 0) 4 5))
                    (exp
                        (add (get (load.trace 0) 2) (get (load.static 0) 6))
                        (load.const 0)))))
        (sub
            (load.trace 1)
            (add
                (vector (slice (load.static 0) 0 1) (scalar 0))
                (mul 
                    (add
                        (mul (load.local 0) (get (load.static 0) 3))
                        (mul (load.local 1) (sub (scalar 1)  (get (load.static 0) 3))))
                    (get (load.static 0) 2)))
		)
	)
    (export main (init seed) (steps 64)))`), options);

// TESTING
// ================================================================================================
// set up inputs and assertions
const inputs = [[42n], [43n]];
const assertions = [
    { step: steps-1, register: 0, value: result[0] },
    { step: steps-1, register: 1, value: result[1] },
];

// generate a proof
const proof = poseidonStark.prove(assertions, inputs, [inputs[0][0], inputs[1][0], 0n]);
console.log('-'.repeat(20));

// verify the proof
poseidonStark.verify(assertions, proof);
console.log('-'.repeat(20));
console.log(`Proof size: ${Math.round(poseidonStark.sizeOf(proof) / 1024 * 100) / 100} KB`);
console.log(`Security level: ${poseidonStark.securityLevel}`)