# genSTARK
This library is intended to help you quickly and easily generate STARK-based proofs of computation using JavaScript. The goal is to take care of as much boilerplate code as possible, and let you focus on the specifics of the task at hand.

### Disclaimer
**DO NOT USE THIS LIBRARY IN PRODUCTION.** At this point, this is a research-grade library. It has known and unknown bugs and security flaws.

# Install
```Bash
$ npm install @guildofweavers/genstark --save
```

# Usage
Here is a trivial example of how to use this library. In this case, the computation is just adding 1 to the current value at each step. That is: x<sub>n+1</sub> = x<sub>n</sub> + 1.

```TypeScript
import { Stark, PrimeField, ExecutionFrame, EvaluationFrame } from '@guildofweavers/genstark';

// define a very simple state transition function 
function fooTransition(this: ExecutionFrame) {
    const v = this.getValue(0);     // get value for current step from register 0
    const nv = this.add(v, 1n);
    this.setNextValue(0, nv);       // next state = current state + 1
} 

// define a corresponding transition constraint
function fooConstraint(this: EvaluationFrame): bigint {
    const v = this.getValue(0);             // get value for current step from register 0
    const nv = this.getNextValue(0);        // get value for the next step from register 0
    return this.sub(nv, this.add(v, 1n));   // return nv - (v + 1)
}

// build a STARK for this computation
const fooStark = new Stark({
    field               : new PrimeField(2n**32n - 3n * 2n**25n + 1n),
    registerCount       : 1,                // we only need 1 register
    tFunction           : fooTransition,
    tConstraints        : [fooConstraint],
    tConstraintDegree   : 1                 // degree of our constraint is 1
});

// create a proof that if we start computation at 1, we end up at 64 after 64 steps
const assertions = [
    { register: 0, step: 0, value: 1n },    // value at first step is 1
    { register: 0, step: 63, value: 64n }   // value at last step is 64
];
const proof = fooStark.prove(assertions, 64, [1n]);

// verify that if we start at 1 and run the computation for 64 steps, we get 64
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
| registerCount      | Number of mutable registers for the computation. Must be at least 1, and cannot be greater than 63. The `inputs` array passed to `prove()` method must hold values to initialize all specified registers. |
| constantCount?     | Number of readonly registers for the computation. These registers are populated with data based on the `constants` parameter passed to `prove()` and `verify()` methods. This property is optional; the default is 0; the max is 64. |
| tFunction          | State [transition function](#Transition-function) for the computation. |
| tConstraints       | An array of [transition constraint](#Transition-constraints) functions for the computation. The array must contain at least one element. |
| tConstraintDegree  | The highest algebraic degree of the provided transition constraints. |
| extensionFactor?   | Number by which the execution trace is "stretched." Must be a power of 2 at least 2x of the `tConstraintDegree`, but cannot exceed 32. This property is optional, the default is smallest power of 2 that is greater than `tConstraintDegree * 2`. |
| exeSpotCheckCount? | Number of positions in the execution trace to include into the proof. This property is optional; the default is 80; the max is 128. |
| friSpotCheckCount? | Number of positions in the columns of low degree proof to include into the proof. This property is optional; the default is 40; the max is 64. |
| hashAlgorithm?     | Hash algorithm to use when building Merkle trees for the proof. Currently, can be one of two values: `sha256` or `blake2s256`. This property is optional; the default is `sha256`. |
| logger?            | An optional [Logger](/lib/utils/Logger.ts) object to collect info about how STARK proof/verification are running. The default logger just prints everything to the console, but you can provide any other object that complies with the Logger interface. |

## Generating and verifying proofs
Once you have a `Stark` object, you can start generating proofs using `Stark.prove()` method like so:
```TypeScript
const proof = myStark.prove(assertions, steps, inputs, constants);
```
The meaning of the parameters is as follows:

| Parameter  | Description |
| ---------- | ----------- |
| assertions | An array of [Assertion](#Assertions) objects (also called boundary constraints). These assertions specify register values at specific steps of a valid computation. At least 1 assertion must be provided. |
| steps      | Number of steps in the computation. Number of steps must be a power of 2. |
| inputs     | An array of `BigInt`'s containing initial values for all mutable registers. The length of the array must be the same as `registerCount` specified in STARK config. |
| constants? | An array of [Constant](#Constants) objects defining how readonly registers are populated. The length of the array must be the same as `constantCount` specified in STARK config. If `constantCount=0`, this parameter should be omitted. |

Once you've generated a proof, you can verify it using `Stark.verify()` method like so:

```TypeScript
const result = myStark.verify(assertions, proof, steps, constants);
```
The meaning of the parameters is as follows:

| Parameter  | Description |
| ---------- | ----------- |
| assertions | The same array of [Assertion](#Assertions) objects that was passed to the `prove()` method. |
| proof      | The proof object that was generated by the `prove()` method. |
| steps      | The same number of steps that was passed to the `prove()` method. |
| constants? | The same array of [Constant](#Constants) objects that was passed to the `prove()` method. |

Notice that `inputs` array does not need to be provided to the `verify()` method. Verifying the proof basically attests to something like this: 


>If you start with some set of inputs (known to the prover), and run the computation for the specified number of steps, the execution trace generated by the computation will satisfy the specified assertions.


## Transition function
A core component of STARK's definition is the state transition function. The transition function is called once for each step of the computation, and must update all mutable registers to the next set of values. The function can access the current `ExecutionFrame` via `this` object.

You can use the execution frame to update a mutable register to the next value like so:
```TypeScript
this.setNextValue(index, value);
```
where, `index` is a 0-based register index, and `value` is the new value for the register.

You can also use the execution frame to read current register values like so:
```TypeScript
this.getValue(index);  // returns current value from a mutable register at the specified index
this.getConst(index);  // returns current value from a readonly register at the specified index
```

Lastly, the execution frame exposes a set of math operations that you can use within the transition function:

```TypeScript
interface FrameOps {
    add(a: bigint, b: bigint): bigint;
    sub(a: bigint, b: bigint): bigint;
    mul(a: bigint, b: bigint): bigint;
    div(a: bigint, b: bigint): bigint;
    exp(b: bigint, p: bigint): bigint;
}
```

**Important:** you should rely only on the exposed math operations to calculate the next set of register values. Using other operations or conditional logic may generate proofs that will fail upon verification.

## Transition constraints
Another core component of STARK's definition is a set of transition constraints. A computation is considered valued only if transition constraints are satisfied for all steps (except the last one).

Similarly to transition function, a transition constraint is a function that is called once for each step of the computation. If the constraint function returns 0, the constraint is satisfied, otherwise the constraint fails. At each step, the function can access the current `EvaluationFrame` via `this` object.

An evaluation frame is similar to the execution frame, except instead of `setNextValue()` method, it exposes a `getNextValue()` method:

```TypeScript
this.getValue(index);       // returns current value from a mutable register at the specified index
this.getConst(index);       // returns current value from a readonly register at the specified index
this.getNextValue(index);   // returns next value from a mutable register at the specified index
```

Also, similarly to the execution frame, evaluation frame exposes a set of math operations that you can use within the transition constraint function:

```TypeScript
interface FrameOps {
    add(a: bigint, b: bigint): bigint;
    sub(a: bigint, b: bigint): bigint;
    mul(a: bigint, b: bigint): bigint;
    div(a: bigint, b: bigint): bigint;
    exp(b: bigint, p: bigint): bigint;
}
```

**Important:** you should rely only on the exposed math operations to perform calculations with the function. Using other operations or conditional logic may generate proofs that will fail upon verification.

**Note:** you should note the highest algebraic degree of calculations you use in the constraint function and pass it to the `Stark` constructor as `tConstraintDegree` property. For example, if you raise register value to power 3, your `tConstraintDegree` should be set to 3.

## Assertions
Assertions (or boundary constraints) are objects that specify the exact value of a given register at a given step. An assertion object has the following form:

```TypeScript
interface Assertion {
    register: number;   // register index
    step    : number;   // step in the execution trace
    value   : bigint;   // value that the register should have at the specified step
}
```

## Constants
In addition to mutable registers, you can define STARKs with readonly registers. A readonly register is a register whose value cannot be changed during the computation. You can read values from such registers using `getConst()` method of execution and evaluation frames as described previously.

You can defined readonly registers by using `Constant` object, which has the following form:
```TypeScript
interface Constant {
    values  : bigint[];
    pattern : ConstantPattern;
}
```
where, `values` is an array of constant values for the register, and `pattern` is a flag indicating how the values will appear in the register. The `pattern` can be one of the following:

* **repeat** - the constants will be "cycled" during execution. For example, if `values = [1, 2, 3, 4]`, and the execution trace is 16 steps long, the constants will appear in the execution trace as: `[1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4, 1, 2, 3, 4]`.
* **stretch** - the constants will be "stretched" during execution. For example, if `values = [1, 2, 3, 4]`, and the execution trace is 16 steps long, the constants will appear as: `[1, 0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4, 0, 0, 0]`.

For more explanation see [demo](/examples/demo.ts) example.

# Performance
Some very informal benchmarks run on Intel Core i5-7300U @ 2.60GHz:

| STARK     | Degree | Registers | Steps          | Proof Time | Proof Size |
| --------- | :----: | :-------: | :------------: | :--------: | :--------: |
| MiMC      | 3      | 1         | 2<sup>6</sup>  | 100 ms     | 48 KB      |
| MiMC      | 3      | 1         | 2<sup>13</sup> | 4.5 sec    | 230 KB     |
| MiMC      | 3      | 1         | 2<sup>17</sup> | 72 sec     | 390 KB     |
| Fibonacci | 1      | 2         | 2<sup>16</sup> | 50 ms      | 12 KB      |
| Fibonacci | 1      | 2         | 2<sup>13</sup> | 1 sec      | 147 KB     |
| Fibonacci | 1      | 2         | 2<sup>17</sup> | 13 sec     | 287 KB     |

The potential to improve proof time is at least 10x (by moving hashing and math functions out of JavaScript), and potentially as much as 100x (by using SIMD and parallelism).

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