# Rescue STARKs

Examples in this directory use [Poseidon hash function](https://eprint.iacr.org/2019/458.pdf) to define various STARKs.

## Hash preimage
There is example that generates STARKs to prove knowledge of hash preimage.

### Hash 6x128

In this example, the following parameters are uses:
 * p (field modulus): 2^128 - 9 * 2^32 + 1
 * m (number of registers): 6
 * a (S-Box exponent): 5
 * N (rounds): 63
   * 8 full rounds, and 55 partial rounds

 ## Merkle Proof
 This example generates STARKs for computations that verify Merkle proofs. Basically, it can be used to prove that you know a proof for some value in a Merkle tree at the specified index without revealing that value or the proof.

 Just as a reminder the code (in JavaScript) for verifying Merkle proof looks like this:
 ```JavaScript
 function verify(root, index, proof) {
     index += 2**proof.length;

    let v = proof[0];
    for (let i = 1; i < proof.length; i++) {
        p = proof[i];
        if (index & 1) {
            v = hash(p, v);
        }
        else {
            v = hash(v, p);
        }
        index = index >> 1;
    }

    return root === v;
 }
 ```
The way this is translated into a STARK is:

* There are 12 state registers:
  * The first 6 registers are used to compute `hash(p, v)`
  * The other 6 registers are used to compute `hash(v, p)`
* Hashing a value takes 63 steps - so, the computation is broken into 64-step rounds. The first 63 steps of each round are used to hash the values, and the last step is used to set the values for the next round of hashing.
* There is 1 public input register that holds a binary representation of the `index` parameter such that the next binary digit of the index "appears" in the register every 64 steps.
  * This value is used to determine which of the hashes advances to the next round of computation.
* There are 2 secret input register that holds values for `proof` nodes such that a new node value "appears" in the registers every 64 steps.

This all results into a transition function that looks like this:
```
transition 12 registers in ${roundSteps * treeDepth} steps {
    when ($k7) {
        when ($k6) {
            // full rounds

            K: [$k0, $k1, $k2, $k3, $k4, $k5];
                
            // compute hash(p, v)
            S1: [$r0, $r1, $r2, $r3, $r4, $r5];
            S1: MDS # (S1 + K)^alpha;

            // compute hash(v, p)
            S2: [$r6, $r7, $r8, $r9, $r10, $r11];
            S2: MDS # (S2 + K)^alpha;

            out: [...S1, ...S2];
        }
        else {
            // partial rounds

            // compute hash(p, v)
            va: ($r5 + $k5)^alpha;
            S1: [$r0 + $k0, $r1 + $k1, $r2 + $k2, $r3 + $k3, $r4 + $k4, va];
            S1: MDS # S1;

            // compute hash(v, p)
            vb: ($r11 + $k5)^alpha;
            S2: [$r6 + $k0, $r7 + $k1, $r8 + $k2, $r9 + $k3, $r10 + $k4, vb];
            S2: MDS # S2;

            out: [...S1, ...S2];
        }
    }
    else {
        // this happens every 64th step

        h1: $p0 ? $r6 | $r0;
        h2: $p0 ? $r7 | $r1;

        S1: [h1, h2, $s0, $s1, 0, 0];
        S2: [$s0, $s1, h1, h2, 0, 0];

        out: [...S1, ...S2];
    }
}
```