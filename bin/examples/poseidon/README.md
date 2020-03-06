# Poseidon STARKs

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
  * The first 6 registers (`$r0` - `$r5`) are used to compute `hash(p, v)`.
  * The other 6 registers (`$r6` - `$r11`) are used to compute `hash(v, p)`.
* Each register is 128-bits - so, 2 registers are required to hold a single 256-bit value. For example, `hash(p, v)` works like so:
  * Value `p` goes into registers `$r0` and `$r1`. Value `v` goes into registers `$r2` and `$r3`. The other 2 registers (`$r4` and `$r5`) are used internally by the hash function algorithm and are initialized to `0`.
  * After 63 steps, the hash of two values is in registers `$r0` and `$r1`.
* Since, hashing takes 63 steps, the computation consists of a 64-step loop repeated for each node of a Merkle branch. The code works as follows:
  * The computation requires 3 inputs:
    * `leaf` - this is the node for which the Merkle proof is generated. It requires 2 field elements to represent.
    * `nodes` - this is the Merkle path to the `leaf`. It also requires 2 field elements to represent, but unlike `leaf` the rank of this input is 1. This means, that for every leaf value, there can be many node values provided.
    * `indexBit` - this holds a binary representation of the leaf's position. It is represented by a single element which is restricted to binary values. This input also has a rank 1. So, for every node, a single index bit should be provided.
  * The first `init` clause is executed once for each branch (you can generate proofs for multiple branches). All it does is initialize the execution state (`$r` registers) to hold values passed in via `leaf` and `node` inputs (see [this](https://github.com/GuildOfWeavers/AirScript#nested-input-loops) for more explanation of how input loops work).
  * The second `init` clause is executed once for each node in a branch. It uses value of `bitIndex` to figure out which of the hashed values (`hash(p, v)` or `hash(v, p)`) advances to the next cycle of hashing.
  * The `for steps` loops execute the actual hash function logic. Since Poseidon hash function has full and partial rounds, different transition logic is applied at different steps in the computation.

This all results into a transition function that looks like this:
```
transition 12 registers {
    for each (leaf, node, indexBit) {

        // initialize state with first 2 node values
        init {
            S1 <- [...leaf, ...node, 0, 0];
            S2 <- [...node, ...leaf, 0, 0];
            yield [...S1, ...S2];
        }

        for each (node, indexBit) {

            // for each node, figure out which value advances to the next cycle
            init {
                H <- indexBit ? $r[6..7] : $r[0..1];
                S1 <- [...H, ...node, 0, 0];
                S2 <- [...node, ...H, 0, 0];
                yield [...S1, ...S2];
            }

            // execute Poseidon hash function computation for 63 steps
            for steps [1..4, 60..63] {
                // full round
                S1 <- mds # ($r[0..5] + roundConstants)^alpha;
                S2 <- mds # ($r[6..11] + roundConstants)^alpha;
                yield  [...S1, ...S2];
            }

            for steps [5..59] {
                // partial round
                v1 <- ($r5 + roundConstants[5])^5;
                S1 <- mds # [...($r[0..4] + roundConstants[0..4]), v1];
                v2 <- ($r11 + roundConstants[5])^5;
                S2 <- mds # [...($r[6..10] + roundConstants[0..4]), v2];
                yield [...S1, ...S2];
            }
        }
    }
}
```