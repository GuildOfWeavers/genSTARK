# Demo STARKs

This directory contains examples demonstrating different features of the library. The examples are described below.

## Static registers

This example shows how different types of static registers can be used. The transition function is very simple: it operates with 1 mutable register and 2 readonly registers. The full execution trace is shown at the end of this file.

## Input registers

This example shows how different types of input registers can be used. The transition function is the same as in the static register example, but the values for the readonly registers are supplied via public and secret inputs (rather than being static).

## Conditional

This example shows how execution of the same computation over multiple sets of inputs can be combined into a single STARK. In this case, the computation is a modified version of a [Rescue hash function](https://eprint.iacr.org/2019/426.pdf). A single execution is 32 steps. In the example, 16 executions of the hash function are batched into a single proof.

The STARK is using 4 mutable registers and 12 readonly registers. The readonly registers have the following purpose:

* 2 secret input registers hold values for inputs to be hashed.
* 1 binary static register is used to control `when...else` statement logic such that first of every 32 steps reads values from the secret registers.
* 8 static registers are used to hold constants for Rescue hash function.

# Fibonacci
This example shows how to create a STARK to verify computation of Fibonacci numbers. Because a Fibonacci number depends on 2 values preceding it, we set up the STARK with 2 mutable registers holding 2 consecutive Fibonacci numbers. So, in effect, a single step in the computation advances the Fibonacci sequence by 2 values.