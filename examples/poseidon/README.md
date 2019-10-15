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
* There is also a single auxiliary input register `$p0` which holds a binary representation of the `index` value. The value in this register is used to figure out whither `hash(p, v)` or `hash(v, p)` advances to the next cycle.
* Since, hashing takes 63 steps, the computation consists of a 64-step loop repeated for each node of a Merkle branch. The code works as follows:
  * The value of the node at `index` is passed in via registers `$i0` and `$i1`. All other nodes in the merkle branch are passed in via registers `$i2` and `$i3`. So, there are many values in registers `$i2` and `$i3` for each value in registers `$i0` and `$i1`.
  * The first `init` clause is executed once for each branch (you can generate proofs for multiple branches). All it does is initialize `$r` registers to hold values passed in via `$i` registers (see [this](https://github.com/GuildOfWeavers/AirScript#nested-input-loops) for more explanation of how input loops work).
  * The second `init` clause is executed once for each node in a branch. It uses value in `$p0` to figure out which of the hashed values (`hash(p, v)` or `hash(v, p)`) advances to the next cycle of hashing.
  * The `for steps` loops execute the actual hash function logic. Since Poseidon hash function has full and partial rounds, different transition logic is applied at different steps in the computation.

This all results into a transition function that looks like this:
```
transition 12 registers {
    for each ($i0, $i1, $i2, $i3) {

        // initialize state with first 2 node values
        init {
            S1 <- [$i0, $i1, $i2, $i3, 0, 0];
            S2 <- [$i2, $i3, $i0, $i1, 0, 0];
            [...S1, ...S2];
        }

        for each ($i2, $i3) {

            // for each node, figure out which value advances to the next cycle
            init {
                H <- $p0 ? $r[6..7] : $r[0..1];
                S1 <- [...H, $i2, $i3, 0, 0];
                S2 <- [$i2, $i3, ...H, 0, 0];
                [...S1, ...S2];
            }

            // execute Poseidon hash function computation for 63 steps
            for steps [1..4, 60..63] {
                // full rounds
                S1 <- MDS # ($r[0..5] + $k)^alpha;
                S2 <- MDS # ($r[6..11] + $k)^alpha;
                [...S1, ...S2];
            }

            for steps [5..59] {
                // partial round
                S1 <- MDS # [...($r[0..4] + $k[0..4]), ($r5 + $k5)^alpha];	
                S2 <- MDS # [...($r[6..10] + $k[0..4]), ($r11 + $k5)^alpha];
                [...S1, ...S2];
            }
        }
    }
}
```