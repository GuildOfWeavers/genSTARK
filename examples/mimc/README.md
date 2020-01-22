# MiMC STARKs
Example STARKs in this directory closely mimics [MiMC STARK](https://vitalik.ca/general/2018/07/21/starks_part_3.html) described by Vitalik Buterin in his blog post series about STARKs.

There are three versions of MiMC STARK here:
1. MiMC STARK in a 128-bit field written in [AirScript](https://github.com/GuildOfWeavers/AirScript).
2. MiMC STARK in a 128-bit field written in [AirAssembly](https://github.com/GuildOfWeavers/AirAssembly).
3. MiMC STARK in a 256-bit field written in [AirScript](https://github.com/GuildOfWeavers/AirScript).

The 128-bit versions are currently able to take advantage of WASM-optimized field operations, which makes them much faster.