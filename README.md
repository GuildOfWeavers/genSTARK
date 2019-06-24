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
import { Stark, PrimeField } from '@guildofweavers/genstark';

// define a STARK for this computation
const fooStark = new Stark(`
define Foo over prime field(2^32 - 3 * 2^25 + 1) {

    // define transition function
    transition 1 register in 64 steps {
        out: $r0 + 2;
    }

    // define transition constraints
    enforce 1 constraint of degree 1 {
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
* [Fibonacci STARK](/examples/fibonacci) - proofs of computation for [Fibonacci numbers](https://en.wikipedia.org/wiki/Fibonacci_number).
* [MiMC STARK](/examples/mimc) - basically the same as Vitalik Buterin's [MiMC tutorial](https://vitalik.ca/general/2018/07/21/starks_part_3.html).
* [Rescue STARKs](/examples/rescue) - proof of knowledge of hash preimage of [Rescue](https://eprint.iacr.org/2019/426.pdf) hash function.

When you run the examples, you should get a nice log documenting each step. Here is an example output of running MiMC STARK for 2<sup>13</sup> steps:
```
Starting STARK computation
Set up evaluation context in 86 ms
Generated execution trace in 33 ms
Converted execution trace into polynomials and low-degree extended them in 826 ms
Computed Q(x) polynomials in 337 ms
Computed Z(x) polynomial in 24 ms
Inverted Z(x) numerators in 148 ms
Computed D(x) polynomials in 85 ms
Computed B(x) polynomials in 478 ms
Serialized evaluations of P(x), B(x), and D(x) polynomials in 451 ms
Built evaluation merkle tree in 233 ms
Computed 80 evaluation spot checks in 2 ms
Computed random linear combination of evaluations in 468 ms
Computed low-degree proof in 1358 ms
STARK computed in 4530 ms
--------------------
Proof serialized in 3 ms; size: 220.04 KB
--------------------
Proof parsed in 8 ms
--------------------
Starting STARK verification
Set up evaluation context in 22 ms
Computed positions for evaluation spot checks in 1 ms
Decoded evaluation spot checks in 2 ms
Verified evaluation merkle proof in 6 ms
Verified liner combination proof in 3 ms
Verified low-degree proof in 70 ms
Verified transition and boundary constraints in 29 ms
STARK verified in 137 ms
-------------------
```

# API

You can find complete API definitions in [genstark.d.ts](/genstark.d.ts). Here is a quick overview of the provided functionality:

## Defining a STARK

To create a STARK for a computation you need to create a `Stark` object like so:
```TypeScript
const myStark = new Stark(source, options, logger);
```

The meaning of the constructor parameters is as follows:

| Parameter          | Description |
| ------------------ | ----------- |
| source             | [AirScript](https://github.com/GuildOfWeavers/AirScript) source defining transition function, transition constraints, and other properties of the STARK. |
| options?           | An optional property specifying [security parameters](#Security-options) for the STARK. |
| logger?            | An optional logger. The default logger prints output to the console, but it can be replaced with anything that complies with the Logger interface. |

### Security options
Security option parameter should have the following form:

| Property           | Description |
| ------------------ | ----------- |
| extensionFactor?   | Number by which the execution trace is "stretched." Must be a power of 2 at least 2x of the constraint degree, but cannot exceed 32. This property is optional, the default is smallest power of 2 that is greater than 2 * [constraint degree + 1]. |
| exeSpotCheckCount? | Number of positions in the execution trace to include into the proof. This property is optional; the default is 80; the max is 128. |
| friSpotCheckCount? | Number of positions in the columns of low degree proof to include into the proof. This property is optional; the default is 40; the max is 64. |
| hashAlgorithm?     | Hash algorithm to use when building Merkle trees for the proof. Currently, can be one of two values: `sha256` or `blake2s256`. This property is optional; the default is `sha256`. |

## Generating proofs
Once you have a `Stark` object, you can start generating proofs using `Stark.prove()` method like so:
```TypeScript
const proof = myStark.prove(assertions, inputs);
```
The meaning of the parameters is as follows:

| Parameter  | Description |
| ---------- | ----------- |
| assertions | An array of [Assertion](#Assertions) objects (also called boundary constraints). These assertions specify register values at specific steps of a valid computation. At least 1 assertion must be provided. |
| inputs     | An array of `BigInt`'s containing initial values for all mutable registers. This can also be a 2-dimensional array when multiple sets of inputs (see [input injection](#Input-injection) below). |

### Input Injection
When you need to generate a proof of computation for a single set of inputs, you pass these inputs as a simple array to the `prove()` method. This will inject the inputs into the execution trace at position 0. For many use cases, this is sufficient - but what if you need to generate a proof of the same computation for multiple inputs? That's where input injection comes in.

With input injection, you can provide multiple sets of inputs to the `prove()` method, and generate a single proof that the computation was executed correctly for all provided inputs. Here is how it works:

Let's say you've defined a STARK for you computation and this STARK requires 32 steps (e.g. it could be a STARK for a hash function). You want to prove that when run with some secret input `a` the output is `x`, and when run with another secret input `b`, the output is `y`. So, you define your inputs like so:
```TypeScript
let a = [...];        // first set of inputs
let b = [...];        // second set of inputs
let inputs = [a, b];  
```
You can then pass this input object into the `prove()` method, and here is what will happen:

* Input array `a` will get injected into the execution trace at position 0;
* Input array `b` will get injected into the execution trace at position 32;

So, essentially, you'll have an execution trace that is a combination of execution traces of independently running the computation first with inputs `a` and then with inputs `b`.

You'll also need to set up your assertions to check the output of both executions like so:
```TypeScript
let assertions = [
    { step: 31, register: 0, value: x },
    { step: 63, register: 0, value: y }
];
```
(the above assumes that the results of the computation are located in a single register).

For a concrete example, check out a [multiRoundInputs](/examples/demo) demo STARK.

There are a couple of things to note about input injection:

1. The number of input sets must be a power of 2 (e.g. 2, 4, 8, etc.). If you need generate a proof for a different number of input sets, you can just pad them (e.g. if you have 15 input sets, just add a dummy 16th set).
2. When you use multiple input sets, the degree of the calculation is increased by 1. This is handled automatically, so - you don't need to do anything differently, but still a good thing to be aware of.

## Verifying proofs
Once you've generated a proof, you can verify it using `Stark.verify()` method like so:

```TypeScript
const result = myStark.verify(assertions, proof, rounds);
```
The meaning of the parameters is as follows:

| Parameter  | Description |
| ---------- | ----------- |
| assertions | The same array of [Assertion](#Assertions) objects that was passed to the `prove()` method. |
| proof      | The proof object that was generated by the `prove()` method. |
| rounds?    | The number of input sets over which the computation was run. The default value is 1, so, if you ran the computation over a single set of inputs, you can omit this parameter. |

Notice that `inputs` parameter does not need to be provided to the `verify()` method. Verifying the proof basically attests to something like this: 


>If you start with some set of inputs (known to the prover), and run the computation for the specified number of steps, the execution trace generated by the computation will satisfy the specified assertions.

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

| STARK       | Field Size | Degree | Registers | Steps          | Proof Time | Proof Size |
| ----------- | :--------: | :----: | :-------: | :------------: | :--------: | :--------: |
| Fibonacci   | 32 bits    | 1      | 2         | 2<sup>6</sup>  | 50 ms      | 12 KB      |
| Fibonacci   | 32 bits    | 1      | 2         | 2<sup>13</sup> | 1 sec      | 147 KB     |
| Fibonacci   | 32 bits    | 1      | 2         | 2<sup>17</sup> | 13 sec     | 290 KB     |
| MiMC        | 256 bits   | 3      | 1         | 2<sup>6</sup>  | 100 ms     | 46 KB      |
| MiMC        | 256 bits   | 3      | 1         | 2<sup>13</sup> | 4.5 sec    | 220 KB     |
| MiMC        | 256 bits   | 3      | 1         | 2<sup>17</sup> | 72 sec     | 394 KB     |
| Rescue      | 128 bits   | 3      | 4         | 2<sup>5</sup>  | 120 ms     | 37 KB      |
| Rescue x16  | 128 bits   | 3      | 4         | 2<sup>9</sup>  | 1 sec      | 114 KB     |
| Rescue x256 | 128 bits   | 3      | 4         | 2<sup>13</sup> | 13 sec     | 237 KB     |

The potential to improve proof time is at least 10x (by moving hashing and math functions out of JavaScript), and potentially much higher (by using SIMD and parallelism).

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