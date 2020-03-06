# AirAssembly libraries
This directory contains [AirAssembly](https://github.com/GuildOfWeavers/AirAssembly) libraries which can be used within AirScript modules. The intent of these libraries is to promote use of common components thereby simplifying writing STARKs for your computations.

Currently, two libraries are available:

1. [lib128](/lib128.aa) - this library operates over a 128-bit field with modulus `2^128 - 9 * 2^32 + 1` and contains AIR for the following computations:
    1. Poseidon hash function
    2. Merkle path authentication
    3. Merkle tree update
2. [lib224](/lib224.aa) - this library operates over a 224-bit field with modulus `2^224 - 2^96 + 1` and contains AIR for the following computations:
    1. Poseidon hash function
    2. Merkle path authentication
    3. Merkle tree update
    4. Schnorr signature verification

### Poseidon hash function
Both libraries export AIR for [Poseidon hash function](https://eprint.iacr.org/2019/458) under the name `ComputePoseidonHash`. Refer to [here](https://github.com/GuildOfWeavers/genSTARK/blob/master/examples/assembly/lib128.ts#L51), [here](https://github.com/GuildOfWeavers/genSTARK/blob/master/examples/assembly/lib224.ts), and [here](https://github.com/GuildOfWeavers/genSTARK/blob/master/examples/assembly/merkleProof.ts) for examples of how this can be used to define STARKs.

The parameters for the hash function are as follows:

* S-box degree: 5
* Rounds: 8 full rounds + 55 partial rounds (63 total)
* State width: 3 registers in `lib224` or 6 registers in `lib128`

The hash function takes 2 values and hashes them into a single value like so:
* In case of `lib224`, each of the inputs consists of a single field element, and the hash result (which is also a single field element) will be located in register 0.
* In cae of `lib128`, each value is represented by 2 field elements. The hash result (which is also 2 field elements) will be located in registers 0 and 1.

### Merkle path authentication
Both libraries export AIR for Merkle path authentication under the name `ComputeMerkleRoot`. The underlying hash function for the computation is the Poseidon hash function described above. Refer to [here](https://github.com/GuildOfWeavers/genSTARK/blob/master/examples/assembly/lib128.ts#L77) and [here](https://github.com/GuildOfWeavers/genSTARK/blob/master/examples/assembly/lib224.ts#L75) for examples of how this can be used to define STARKs.

The computation uses 6 registers (in case of `lib224`) or 12 registers (in case of `lib128`) to compute two parallel hashes for each "leg" of a Merkle proof. The high-level logic for how this is done is described [here](https://github.com/GuildOfWeavers/genSTARK/tree/master/examples/poseidon#merkle-proof) and can also be seen in [this example](https://github.com/GuildOfWeavers/genSTARK/blob/master/examples/assembly/merkleProof.ts).

To generate a proof, 3 sets of inputs are required:
1. A leaf node of the authentication path,
2. An array containing nodes which represent the remainder of the authentication path,
3. An array containing binary representation of the leaf node's index.

To verify the proof, knowing the tree's root and the index of the leaf node is sufficient. Basically, a valid proof means that the prover knows an authentication path from the tree's root to the specified index.

### Merkle tree update
Both libraries export AIR for Merkle tree update under the name `ComputeMerkleUpdate`. Refer to [here](https://github.com/GuildOfWeavers/genSTARK/blob/master/examples/assembly/lib128.ts#L119), [here](https://github.com/GuildOfWeavers/genSTARK/blob/master/examples/assembly/lib224.ts#L115), and [here](https://github.com/GuildOfWeavers/genSTARK/blob/master/examples/assembly/merkleUpdate.ts) for examples of how this can be used to define STARKs.

This computation proves that replacing a leaf at the specified index results in the specified Merkle root. To generate a proof, 4 sets of inputs are required:

1. The old leaf node of the authentication path,
2. The new leaf node of the authentication path,
3. An array containing nodes which represent the remainder of the authentication path,
3. An array containing binary representation of the leaf node's index.

The proof can be verified in one of 2 ways:
1. The prover can reveal only the pre-update and post-update roots, and the verifier can be convinced that the update was carried out correctly.
2. In addition to pre-update and post-update roots, the prover can also reveal old and new leaf values, as well as the index of the leaf node that was updated. In this case, the verifier can be convinced that the new root represents swapping out of a single leaf in the Merkle tree.

### Schnorr signature verification
AIR for [Schnorr signature](https://en.wikipedia.org/wiki/Schnorr_signature) verification is available only in the `lib224` library and is exported under the name `VerifySchnorrSignature`. The elliptic curve used for the signature is [NIST secp224r1](http://www.secg.org/sec2-v2.pdf). Refer [here](https://github.com/GuildOfWeavers/genSTARK/blob/master/examples/assembly/lib224.ts#L161) for examples of how this can be used to define STARKs.

Given a message `m`, a public key `P`, and a signature `(R, s)` a prover can generate a proof that `s ⋅ G = R + hash(P, R, m) ⋅ P`. In the current implementation, the verifier needs to know `m`, `P`, and `R` (but not `s`) to check the proof.

The high-level description of AIR is as follows:

* Execution trace has 14 registers:
   * The first 7 are used to compute `s ⋅ G`,
   * The other 7 are used to compute `R + h ⋅ P`, where `h` is an input equal to `hash(P, R, m)`.
* A simple [double-and-add](https://en.wikipedia.org/wiki/Elliptic_curve_point_multiplication#Double-and-add) algorithm for elliptic curve multiplication:
  * At each step the base point is doubled, and when needed, added to the accumulated result (x, y coordinates for base points and accumulated results account for 4 out of 7 registers used in each multiplication).
  * Slopes for addition/doubling are pre-compute one step before the actual addition/doubling to keep constraint degree low.
  * The total number of transition constraints is 18, and the highest constraint degree is 6.