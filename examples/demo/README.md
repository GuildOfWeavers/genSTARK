# Demo STARKs

This directory contains examples demonstrating different features of the library. The examples are described below.

## Readonly registers

This example demonstrates how different types of readonly registers can be used. The transition function is very simple: it operates with 1 mutable register and 2 readonly registers. The full execution trace is shown at the end of this file.

## Multi-round inputs

This example how execution of the same computation over multiple sets of inputs can be combined into a single STARK. In this case, the computation is a modified version of a [Rescue hash function](https://eprint.iacr.org/2019/426.pdf).

The STARK is using 4 mutable registers and 8 readonly registers (to hold constants). A single execution is 32 steps. In the example, 16 executions of the hash function are batched into a single proof.