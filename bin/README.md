# genSTARK
This library is intended to help you quickly and easily generate STARK-based proofs of computation using JavaScript. The goal is to take care of as much boilerplate code as possible, and let you focus on the specifics of the task at hand.

### Disclaimer
**DO NOT USE THIS LIBRARY IN PRODUCTION.** At this point, this is a research-grade library. It has known and unknown bugs, and the performance is at least one order of magnitude below what could be considered acceptable.

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
Proof serialized in 4 ms
Proof size: 229.25 KB
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

## Generating and verifying proofs

## Transition function

## Transition constraints

## Assertions

## Constants

# Performance

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