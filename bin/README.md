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
const fooStark = new Stark({
    field               : new PrimeField(2n**32n - 3n * 2n**25n + 1n),
    tExpressions        : { 'n0': 'r0 + 2' },   // define transition function
    tConstraints        : ['n0 - (r0 + 2)'],    // define transition constraints
    tConstraintDegree   : 1                     // degree of our constraint is 1
});

// create a proof that if we start computation at 1, we end up at 127 after 64 steps
const assertions = [
    { register: 0, step: 0, value: 1n },    // value at first step is 1
    { register: 0, step: 63, value: 127n }  // value at last step is 127
];
const proof = fooStark.prove(assertions, 64, [1n]);

// verify that if we start at 1 and run the computation for 64 steps, we get 127
const result = fooStark.verify(assertions, proof, 64);
console.log(result); // true
```

There are a few more sophisticated examples in this repository:
* [MiMC STARK](/examples/mimc.ts) - basically the same as Vitalik Buterin's [MiMC tutorial](https://vitalik.ca/general/2018/07/21/starks_part_3.html).
* [Fibonacci STARK](/examples/fibonacci.ts) - proofs of computation for [Fibonacci numbers](https://en.wikipedia.org/wiki/Fibonacci_number).
* [Demo STARK](/examples/demo.ts) - demonstration of how to use readonly registers.

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
Proof serialized in 3 ms; size: 229.25 KB
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
const myStark = new Stark({ /* STARK config */ });
```

The `config` object passed to the STARK constructor can have the following properties:

| Property           | Description |
| ------------------ | ----------- |
| field              | A finite field for all math operations during the computation. Currently, only `PrimeField` is available (it is actually just re-exported from the [galois](https://github.com/GuildOfWeavers/galois) project). |
| tExpressions       | An object with expressions defining state [transition function](#Transition-function) for all register. The number of registers must be between 1 and 64. |
| tConstraints       | An array of [transition constraint](#Transition-constraints) expressions for the computation. The number of constraints must be between 1 and 1024. |
| tConstraintDegree  | The highest algebraic degree of the provided transition constraints. |
| constants?         | An array of [constant definitions](#Constants) for values that will be available in readonly registers during the computation. If provided, cannot have more than 64 elements. |
| extensionFactor?   | Number by which the execution trace is "stretched." Must be a power of 2 at least 2x of the `tConstraintDegree`, but cannot exceed 32. This property is optional, the default is smallest power of 2 that is greater than `tConstraintDegree * 2`. |
| exeSpotCheckCount? | Number of positions in the execution trace to include into the proof. This property is optional; the default is 80; the max is 128. |
| friSpotCheckCount? | Number of positions in the columns of low degree proof to include into the proof. This property is optional; the default is 40; the max is 64. |
| hashAlgorithm?     | Hash algorithm to use when building Merkle trees for the proof. Currently, can be one of two values: `sha256` or `blake2s256`. This property is optional; the default is `sha256`. |

## Generating and verifying proofs
Once you have a `Stark` object, you can start generating proofs using `Stark.prove()` method like so:
```TypeScript
const proof = myStark.prove(assertions, steps, inputs);
```
The meaning of the parameters is as follows:

| Parameter  | Description |
| ---------- | ----------- |
| assertions | An array of [Assertion](#Assertions) objects (also called boundary constraints). These assertions specify register values at specific steps of a valid computation. At least 1 assertion must be provided. |
| steps      | Number of steps in the computation. Number of steps must be a power of 2. |
| inputs     | An array of `BigInt`'s containing initial values for all mutable registers. The length of the array must be the same as `registerCount` specified in STARK config. |


Once you've generated a proof, you can verify it using `Stark.verify()` method like so:

```TypeScript
const result = myStark.verify(assertions, proof, steps);
```
The meaning of the parameters is as follows:

| Parameter  | Description |
| ---------- | ----------- |
| assertions | The same array of [Assertion](#Assertions) objects that was passed to the `prove()` method. |
| proof      | The proof object that was generated by the `prove()` method. |
| steps      | The same number of steps that was passed to the `prove()` method. |

Notice that `inputs` array does not need to be provided to the `verify()` method. Verifying the proof basically attests to something like this: 


>If you start with some set of inputs (known to the prover), and run the computation for the specified number of steps, the execution trace generated by the computation will satisfy the specified assertions.


## Transition function
A core component of STARK's definition is the state transition function. You can define a state transition function by supplying transition expressions for all mutable registers like so:
```TypeScript
{
    'n0': 'r0 + k0 + 1'
}
```
The above example defines a transition expression for a single register. Here is how to interpret it:

* `r0` is a reference to the current value of mutable register 0.
* `n0` is a reference to the next value of mutable register 0.
* `k0` is a reference to the current value of readonly register 0.

So, the expression says: the next value of mutable register 0 is equal to the current value of the register, plus the current value of readonly register 0, plus 1.

You can use simple algebraic operators `+`, `-`, `*`, `/`, `^` to define expressions of any complexity. You can also have up to 64 mutable registers and up to 64 readonly registers. In case of multiple registers, you can refer to them as `r1`, `r2`, `r3`, etc.

One thing to note, you cannot reference future register states within a transition expression. So, something like this would not be valid:
```TypeScript
{
    'n0': 'r0 + 1',
    'n1': 'n0 * 2'
}
```
But you can easily redefine this as a valid expression like so:
```TypeScript
{
    'n0': 'r0 + 1',
    'n1': '(r0 + 1) * 2'
}
```

## Transition constraints
Another core component of STARK's definition is a set of transition constraints. A computation is considered valid only if transition constraints are satisfied for all steps (except the last one).

Similarly to transition function, a transition constraint is defined using algebraic expressions like so:
```TypeScript
[
    `n0 - (r0 + k0 + 1)`
]
```
However, unlike transition function, transition constraints can reference future states of mutable registers.

**Note:** you should note the highest algebraic degree you use in the constraint expressions and pass it to the `Stark` constructor as `tConstraintDegree` property. For example, if you raise value of some register to power 3 (or perform equivalent computation), your `tConstraintDegree` should be set to 3.

## Assertions
Assertions (or boundary constraints) are objects that specify the exact value of a given mutable register at a given step. An assertion object has the following form:

```TypeScript
interface Assertion {
    register: number;   // index of a mutable register
    step    : number;   // step in the execution trace
    value   : bigint;   // value that the register should have at the specified step
}
```

## Constants
In addition to mutable registers, you can define STARKs with readonly registers. A readonly register is a register whose value cannot be changed by a transition function. You can reference readonly registers in your expressions by using the `k` prefix. For example, `k0`, `k1`, `k2` etc.

You can defined readonly registers by providing constant definitions to `Stark` constructor. Constant definitions have the following form:
```TypeScript
interface Constant {
    values  : bigint[];
    pattern : ConstantPattern;
}
```
where, `values` is an array of constant values for the register, and `pattern` is a flag indicating how the values will appear in the register. The `pattern` can be one of the following:

* **repeat** - the constants will be "cycled" during execution. For example, if `values = [1, 2, 3, 4]`, and the execution trace is 16 steps long, the constants will appear in the execution trace as: `[1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4]`.
* **spread** - the constants will be "spread" during execution. For example, if `values = [1, 2, 3, 4]`, and the execution trace is 16 steps long, the constants will appear as: `[1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0]`.

For more explanation see [demo](/examples/demo.ts) example.

# Performance
Some very informal benchmarks run on Intel Core i5-7300U @ 2.60GHz (single thread):

| STARK     | Field Size | Degree | Registers | Steps          | Proof Time | Proof Size |
| --------- | :--------: | :----: | :-------: | :------------: | :--------: | :--------: |
| MiMC      | 256 bits   | 3      | 1         | 2<sup>6</sup>  | 100 ms     | 46 KB      |
| MiMC      | 256 bits   | 3      | 1         | 2<sup>13</sup> | 4.5 sec    | 220 KB     |
| MiMC      | 256 bits   | 3      | 1         | 2<sup>17</sup> | 72 sec     | 394 KB     |
| Fibonacci | 32 bits    | 1      | 2         | 2<sup>6</sup>  | 50 ms      | 12 KB      |
| Fibonacci | 32 bits    | 1      | 2         | 2<sup>13</sup> | 1 sec      | 147 KB     |
| Fibonacci | 32 bits    | 1      | 2         | 2<sup>17</sup> | 13 sec     | 290 KB     |

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