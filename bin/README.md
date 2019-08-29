# genSTARK
This library is intended to help you quickly and easily generate STARK-based proofs of computation using JavaScript. The goal is to take care of as much boilerplate code as possible, and let you focus on the specific "business logic" of your computations.

### Background
A STARK is a novel proof-of-computation scheme that allows you to create an efficiently verifiable proof that a computation was executed correctly. The scheme was developed by Eli-Ben Sasson and team at Technion-Israel Institute of Technology. STARKs do not require an initial trusted setup, and rely on very few cryptographic assumptions. See [references](#References) for more info.

### Disclaimer
**DO NOT USE THIS LIBRARY IN PRODUCTION.** At this point, this is a research-grade library. It has known and unknown bugs and security flaws.

# Install
```Bash
$ npm install @guildofweavers/genstark --save
```

# Usage
Here is a trivial example of how to use this library. In this example, the computation is just adding 2 to the current value at each step. That is: x<sub>n+1</sub> = x<sub>n</sub> + 2.

```TypeScript
import { Stark } from '@guildofweavers/genstark';

// define a STARK for this computation
const fooStark = new Stark(`
define Foo over prime field (2^32 - 3 * 2^25 + 1) {

    // define transition function
    transition 1 register in 64 steps {
        out: $r0 + 2;
    }

    // define transition constraints
    enforce 1 constraint {
        out: $n0 - ($r0 + 2);
    }
}`);

// create a proof that if we start computation at 1, we end up at 127 after 64 steps
const assertions = [
    { register: 0, step: 0, value: 1n },    // value at first step is 1
    { register: 0, step: 63, value: 127n }  // value at last step is 127
];
const proof = fooStark.prove(assertions, [1n]);

// verify that if we start at 1 and run the computation for 64 steps, we get 127
const result = fooStark.verify(assertions, proof);
console.log(result); // true
```

There are a few more sophisticated examples in this repository:
* [Demo STARKs](/examples/demo) - demonstration of how to use various features of this library.
* [MiMC STARK](/examples/mimc) - basically the same as Vitalik Buterin's [MiMC tutorial](https://vitalik.ca/general/2018/07/21/starks_part_3.html).
* [Rescue STARKs](/examples/rescue) - various STARKs based on [Rescue](https://eprint.iacr.org/2019/426.pdf) hash function (e.g. proof of hash preimage, Merkle proof).

When you run the examples, you should get a nice log documenting each step. Here is an example output of running 128-bit MiMC STARK for 2<sup>13</sup> steps:
```
Starting STARK computation
Set up evaluation context in 10 ms
Generated execution trace in 39 ms
Computed execution trace polynomials P(x) in 7 ms
Low-degree extended P(x) polynomials over evaluation domain in 92 ms
Serialized evaluations of P(x) and S(x) polynomials in 83 ms
Built evaluation merkle tree in 85 ms
Computed 40 evaluation spot checks in 4 ms
Computed composition polynomial C(x) in 496 ms
Combined P(x) and S(x) evaluations with C(x) evaluations in 42 ms
Computed low-degree proof in 314 ms
STARK computed in 1175 ms
--------------------
Proof serialized in 7 ms; size: 86.12 KB
--------------------
Proof parsed in 6 ms
--------------------
Starting STARK verification
Set up evaluation context in 2 ms
Computed positions for evaluation spot checks in 1 ms
Decoded evaluation spot checks in 0 ms
Verified evaluation merkle proof in 3 ms
Verified transition and boundary constraints in 10 ms
Verified low-degree proof in 16 ms
STARK verified in 36 ms
--------------------
STARK security level: 96
```

# API

You can find complete API definitions in [genstark.d.ts](/genstark.d.ts). Here is a quick overview of the provided functionality:

## Defining a STARK

To create a STARK for a computation you need to create a `Stark` object like so:
```TypeScript
const myStark = new Stark(source, security, optimization, logger);
```

The meaning of the constructor parameters is as follows:

| Parameter          | Description |
| ------------------ | ----------- |
| source             | [AirScript](https://github.com/GuildOfWeavers/AirScript) source defining transition function, transition constraints, and other properties of the STARK. |
| security?          | An optional property specifying [security parameters](#Security-options) for the STARK. |
| optimization?      | An optional property specifying [WASM optimization parameters](#Optimization-options) for the STARK. You can also set this to `true` to turn on WASM optimization with default parameters. |
| logger?            | An optional logger. The default logger prints output to the console, but it can be replaced with anything that complies with the Logger interface. |

**Note:** WASM-optimization is available for certain [finite fields](https://github.com/GuildOfWeavers/galois#wasm-optimization) and [hash functions](https://github.com/GuildOfWeavers/merkle#hash). If the field or the hash function you are using does not support WASM-optimization, a warning will be printed and its JavaScript equivalents will be used. In general, WASM optimization can speed up STARK proof time by 2x - 5x.

### Security options
Security options parameter should have the following form:

| Property           | Description |
| ------------------ | ----------- |
| extensionFactor?   | Number by which the execution trace is "stretched." Must be a power of 2 at least 2x of the constraint degree, but cannot exceed 32. This property is optional, the default is smallest power of 2 that is greater than 2 * constraint degree. |
| exeQueryCount? | Number of queries of the execution trace to include into the proof. This property is optional; the default is 80; the max is 128. |
| friQueryCount? | Number of queries of the columns of low degree proof to include into the proof. This property is optional; the default is 40; the max is 64. |
| hashAlgorithm?     | Hash algorithm to use when building Merkle trees for the proof. Currently, can be one of the following values: `sha256`, `blake2s256`. This property is optional; the default is `sha256`. |

### Optimization options
Optimization options parameter should have the following form:

| Property           | Description |
| ------------------ | ----------- |
| initialMemory?     | Initial number of bytes to allocate for WASM optimization; the default is 32 MB. |
| maximumMemory?     | Maximum number of bytes to allocate for WASM optimization; the default is 2 GB.  |

## Generating proofs
Once you have a `Stark` object, you can start generating proofs using `Stark.prove()` method like so:
```TypeScript
const proof = myStark.prove(assertions, initValues, publicInputs?, secretInputs?);
```
The meaning of the parameters is as follows:

| Parameter     | Description |
| ------------- | ----------- |
| assertions    | An array of [Assertion](#Assertions) objects (also called boundary constraints). These assertions specify register values at specific steps of a valid computation. At least 1 assertion must be provided. |
| initValues    | An array of `BigInt`'s containing initial values for all mutable registers. |
| publicInputs? | An array containing values for all specified public registers. This parameter is optional and can be skipped if no public input registers have been defined. |
| secretInputs? | An array containing values for all specified secret registers. This parameter is optional and can be skipped if no secret input registers have been defined. |

### Initial values and inputs
Handling of initial values and inputs deserves a bit more explanation. As described above, there are 3 ways to supply inputs to `STARK.prove()` method:

* `initValues` parameter is always required. It is basically used to define step 0 or the execution trace. Thus, the number of values provided must match the number of mutable registers in the STARK.
* The other two parameters provide values for the input registers defined in the STARK. To learn more about these, refer to [Readonly registers](https://github.com/GuildOfWeavers/AirScript#readonly-registers) section of AirScript documentation. These parameters are required only if STARK's definition includes input registers.

For example, the fragment below specifies that a STARK must have 3 readonly registers, but that the values for these registers are not available at the STARK's definition time (the `[...]` indicate that the values will be provided later):
```
using 3 readonly registers {
    $p0: repeat [...];
    $p1: spread [...];
    $s0: spread [...];
}
```
Moreover, by using prefixes `$p` and `$s` it also specifies that 2 of the registers are *public* (the values will be known to the prover **and** the verified), and 1 of the registers is *secret* (the values will be known **only** to the prover).

So, based on this definition, the parameters for `STARK.prove()` method should be supplied like so:

```TypeScript
// let's say we have 2 mutable registers
let initValues = [1n, 2n];

// define values for public input registers
let pValues1 = [1n, 2n, 3n, 4n];
let pValues2 = [1n, 2n, 3n, 4n, 5n, 6n, 7n, 7n];

// define values for secret input registers
let sValues = [10n, 11n, 12n, 13n];

// generate the proof
let proof = fooStark.prove(assertions, initValues, [pValues1, pValues2], [sValues]);
```
When the proof is generated, the provided values will "appear" in registers `$p0`, `$p1`, and `$s0` to be used in transition function and transition constraints. The rules for how this happens are also described in the [Readonly registers](https://github.com/GuildOfWeavers/AirScript#readonly-registers) section of AirScript documentation.


## Verifying proofs
Once you've generated a proof, you can verify it using `Stark.verify()` method like so:

```TypeScript
const result = myStark.verify(assertions, proof, publicInputs?);
```
The meaning of the parameters is as follows:

| Parameter     | Description |
| ------------- | ----------- |
| assertions    | The same array of [Assertion](#Assertions) objects that was passed to the `prove()` method. |
| proof         | The proof object that was generated by the `prove()` method. |
| publicInputs? | An array containing values for all specified public registers. This parameter is optional and can be skipped if no public input registers have been defined. |

Verifying a proof basically attests to something like this: 

>If you start with some set of initial values (known to the prover), and run the computation for the specified number of steps, the execution trace generated by the computation will satisfy the specified assertions.

## Assertions
Assertions (or boundary constraints) are objects that specify the exact value of a given mutable register at a given step. An assertion object has the following form:

```TypeScript
interface Assertion {
    register: number;   // index of a mutable register
    step    : number;   // step in the execution trace
    value   : bigint;   // value that the register should have at the specified step
}
```

# Performance
Some very informal benchmarks run on Intel Core i5-7300U @ 2.60GHz (single thread):

| STARK                | Field Size | Degree | Registers | Steps          | Proof Time | Proof Size |
| -------------------- | :--------: | :----: | :-------: | :------------: | :--------: | :--------: |
| MiMC*                | 128 bits   | 3      | 1         | 2<sup>13</sup> | 1.2 sec    | 86 KB      |
| MiMC*                | 128 bits   | 3      | 1         | 2<sup>17</sup> | 19 sec     | 137 KB     |
| MiMC                 | 256 bits   | 3      | 1         | 2<sup>13</sup> | 9.2 sec    | 107 KB     |
| MiMC                 | 256 bits   | 3      | 1         | 2<sup>17</sup> | 178 sec    | 162 KB     |
| Merkle Proof (d=8)*  | 128 bits   | 4      | 8         | 2<sup>8</sup>  | 530 ms     | 53 KB      |
| Merkle Proof (d=16)* | 128 bits   | 4      | 8         | 2<sup>9</sup>  | 1.1 sec    | 63 KB      |

Merkle proofs are based on a modified version of [Rescue](/examples/rescue) hash function, and in addition to 8 state registers require 1 public input register and 1 secret input register.

**\*** Takes advantage of WebAssembly optimization.

# References
This library is largely based on Vitalik Buterin's [zk-STARK/MiMC tutorial](https://github.com/ethereum/research/tree/master/mimc_stark). Other super useful resources:

* STARKs whitepaper: [Scalable, transparent, and post-quantum secure computational integrity](https://eprint.iacr.org/2018/046.pdf)

Vitalik Buterin's blog series on zk-STARKs:
* [STARKs, part 1: Proofs with Polynomials](https://vitalik.ca/general/2017/11/09/starks_part_1.html)
* [STARKs, part 2: Thank Goodness it's FRI-day](https://vitalik.ca/general/2017/11/22/starks_part_2.html)
* [STARKs, part 3: Into the Weeds](https://vitalik.ca/general/2018/07/21/starks_part_3.html)

StarkWare's STARK Math blog series:
* [STARK Math: The Journey Begins](https://medium.com/starkware/stark-math-the-journey-begins-51bd2b063c71)
* [Arithmetization I](https://medium.com/starkware/arithmetization-i-15c046390862)
* [Arithmetization II](https://medium.com/starkware/arithmetization-ii-403c3b3f4355)
* [Low Degree Testing](https://medium.com/starkware/low-degree-testing-f7614f5172db)
* [A Framework for Efficient STARKs](https://medium.com/starkware/a-framework-for-efficient-starks-19608ba06fbe)

# License
[MIT](/LICENSE) © 2019 Guild of Weavers