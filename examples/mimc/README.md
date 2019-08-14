# MiMC STARK
Example STARKs in this directory closely mimics [MiMC STARK](https://vitalik.ca/general/2018/07/21/starks_part_3.html) described by Vitalik Buterin in his blog post series about STARKs.

There are two versions of MiMC STARK here: one for a 128-bit field and the other one for a 256-bit field. The 128-bit version is currently able to take advantage of WASM-optimized field operations, otherwise, both versions are identical.