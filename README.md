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
    tFunction           : 'out: $r0 + 2;',          // define transition function
    tConstraints        : 'out: $n0 - ($r0 + 2);',  // define transition constraints
    tConstraintDegree   : 1                         // degree of our constraint is 1
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
* [Demo STARK](/examples/demo.ts) - demonstration of how to use readonly registers.
* [Fibonacci STARK](/examples/fibonacci.ts) - proofs of computation for [Fibonacci numbers](https://en.wikipedia.org/wiki/Fibonacci_number).
* [MiMC STARK](/examples/mimc.ts) - basically the same as Vitalik Buterin's [MiMC tutorial](https://vitalik.ca/general/2018/07/21/starks_part_3.html).
* [Rescue STARK](/examples/rescue) - proof of knowledge of hash preimage of [Rescue](https://eprint.iacr.org/2019/426.pdf) hash function.

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
const myStark = new Stark({ /* STARK config */ });
```

The `config` object passed to the STARK constructor can have the following properties:

| Property           | Description |
| ------------------ | ----------- |
| field              | A finite field for all math operations during the computation. Currently, only `PrimeField` is available (it is actually just re-exported from the [galois](https://github.com/GuildOfWeavers/galois) project). |
| tFunction         | An arithmetic script defining state [transition function](#Transition-function) for the computation. |
| tConstraints       | An arithmetic script defining [transition constraint](#Transition-constraints) for the computation. |
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
| inputs     | An array of `BigInt`'s containing initial values for all mutable registers. The length of the array must be the same as the number of transition function expressions specified in STARK config. |


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
A core component of STARK's definition is the state transition function. You can define a state transition function by providing an [arithmetic script](#Arithmetic-script) which evaluates to the next state of the computation. For example:
```
out: $r0 + $k0 + 1;
```
The script says: the next value of mutable register 0 is equal to the current value of the register, plus the current value of readonly register 0, plus 1.

If your computation involves more than 1 mutable register, your script should return a vector with values for the next state of all registers. Here is an example:
```
a0: $r0 + $r1;
a1: a0 + $r1;
out: [a0, a1];
```
The above example describes a state transition function that operates over 2 registers:

* The next value of register 0 is set to the sum of the current values of both registers;
* The next value of register 1 is set to the same sum plus current value of register 1 again.

(this is actually a somewhat convoluted way to describe a transition function for a Fibonacci sequence).

In general, the length of the vector in the `out` statement defines the width of the state (i.e. number of mutable registers).

## Transition constraints
Another core component of STARK's definition is a set of transition constraints. A computation is considered valid only if transition constraints are satisfied for all steps (except the last one).

Similarly to transition functions, transition constraints are defined by an [arithmetic script](#Arithmetic-script). However, unlike scripts for transition functions, scripts for transition constraints can reference future states of mutable registers. For example:
```
out: $n0 - ($r0 + $k0 + 1);
```
where `$n0` contains value of register `$r0` at the next step of computation.

If you are working with more than one constraint, your transition script should return a vector with evaluations for all of your constraints. For example:
```
a0: $r0 + $r1;
out: [$n0 - a0, $n1 - ($r1 + a0)];
```
(these are constraints matching the Fibonacci transition function described previously).

**Note:** you should note the highest algebraic degree you use in the constraint expressions and pass it to the `Stark` constructor as `tConstraintDegree` property. For example, if you raise value of some register to power 3 (or perform equivalent computation), your `tConstraintDegree` should be set to 3.

## Arithmetic script
If your transition functions and constraints are fairly complex, it will get extremely tedious (and error prone) to write them all out individually. But fear not, arithmetic script is here to help.

An arithmetic script is nothing more than a series of arithmetic statements (separated by semicolons) which evaluate to a number or to a vector of numbers. Here is an example:

```
a0: $r0 + $r1;
a1: $k0 * a0;
out: [a0, a1];
```
Here is what this means:

* Define variable `a0` to be the sum of values from *mutable* registers `$r0` and `$r1`.
* Define variable `a1` to be the product of value from *readonly* register `$k0` and variable `a0`.
* Set the return value of the script to a vector of two elements with values of `a0` and `a1` being first and second elements respectively.

Every statement of an arithmetic script is an *assignment* statement. It assigns a value of an expression (the right side) to a variable (left side). Every script must terminate with an `out` statement which defines the return value of the script.

Within the script you can reference registers, constants, variables, and perform arithmetic operations with them. All of this is described below.

### Registers
A computation's execution trace consists of a series of state transitions. A state of a computation at a given step is held in an array of registers. There are two types of registers:

* **mutable** registers - values in these registers are defined by the state [transition function](#Transition-function). Currently, you can have up to 64 mutable registers.
* **readonly** registers - values in these registers are defined by the [constant definitions](#Constants). Currently, you can have up to 64 readonly registers.

To reference a given register you need to specify the name of the register bank and the index of the register within that bank. Names of all register banks start with `$` - so, register references can look like this: `$r1`, `$k23`, `$n11` etc. Currently, there are 3 register banks:

* **$r** bank holds values of *mutable* registers for the current step of the computation.
* **$n** bank holds values of *mutable* registers for the next step of the computation. This bank can be referenced only in transition constraints script (not in the transition function script).
* **$k** bank holds values of *readonly* registers for the current step of the computation.

### Variables
To simplify your scripts you can aggregate common computations into variables. Once a variable is defined, it can be used in all subsequent statements. You can also change the value of a variable be re-assigning to it. For example, something like this is perfectly valid:
```
a0: $r0 + 1;
a0: a0 + $r1;
out: a0;
```
Variable can be of 3 different types: ***scalars***, ***vectors***, and ***matrixes***.

#### Scalars
A variable that holds a simple numerical value is a scalar. Implicitly, all registers hold scalar values. All constant literals are also scalars. A name of scalar variable can include lower-case letters, numbers, and underscores (and must start with a letter). Here are a few examples:
```
a0: 1;
foo: $r0;
foo_bar: $r0 + 1;
```

#### Vectors
Two or more scalars can be aggregated into a vector (a vector is just a 1-dimensional array). You can define a vector by putting a comma-separated list of scalars between square brackets. A name of a vector variable can include upper-case letters, numbers, and underscores (and must start with a letter). Here are a few examples:
```
V0: [1, 2];
FOO: [$r0, $r1];
FOO_BAR: [$r0, $r1 + 1, $k0];
```

#### Matrixes
A matrix is a 2-dimensional array of scalars with at least 1 row and 2 columns. Similarly to vectors, matrix variable names can include upper-case letters, numbers, and underscores. You can define a matrix by listing its elements in a row-major form. Here are a few examples:
```
M0: [[1, 2], [1, 2]];
FOO: [[$k0, $r0, 1], [$r1 + $r2, 42, $r3 * 8]];
```

### Operations
To do something useful with registers, variables etc. you can apply arithmetic operations to them. These operations are `+`, `-`, `*`, `/`, `^`.

When you work with scalar values, these operations behave as you've been taught in the elementary school (though, the math takes place in a finite field). But you can also apply these operations to vectors and matrixes. In such cases, these are treated as **element-wise** operations. Here are a few examples:
```
V0: [1, 2];
V1: [3, 4];
V2: V0 + V1;    // result is [4, 6]
v2: V1^2;       // result is [9, 16]
```
You can also replace the second operand with a scalar. Here is how it'll work:
```
V0: [1, 2];
V1: V0 * 2;     // result is [2, 4]
```
One important thing to note: if both operands are vectors, the operations make sense only if vectors have the same dimensions (i.e. you can't do element-wise addition between vectors of different lengths).

Even though the examples above focus on vectors, you can apply the same operations to matrixes (of same dimensions), and they'll work in the same way.

There is one additional operation we can apply to vectors and matrixes (but not to scalars): `#`. The meaning of this operation is as follows:

* **matrix # matrix** - performs a standard [matrix multiplication](https://en.wikipedia.org/wiki/Matrix_multiplication) of two matrixes. If the input matrixes have dimensions [*n*,*p*] and [*p*,*m*], the output matrix will have dimensions [*n*,*m*].
* **matrix # vector** - also performs matrix multiplication, but the output is a vector. If the input matrix dimensions are [*n*,*m*], and the length of the input vector is *m*, the output vector will have length *n*.
* **vector # vector** - performs a [linear combination](https://en.wikipedia.org/wiki/Linear_combination) of two vectors. Vectors must have the same length, and the output is a scalar.

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
In addition to mutable registers, you can define STARKs with readonly registers. A readonly register is a register whose value cannot be changed by a transition function. You can reference readonly registers in your scripts by using the `$k` prefix. For example, `$k0`, `$k1`, `$k2` etc.

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