# Demo STARKs

This directory contains examples demonstrating different features of the library. The examples are described below.

## Static variables

This example shows how different types of static registers can be used. The transition function is very simple: it operates with 1 mutable register and 2 readonly registers. The full execution trace is shown at the end of this file.

# Fibonacci
This example shows how to create a STARK to verify computation of Fibonacci numbers. Because a Fibonacci number depends on 2 values preceding it, we set up the STARK with 2 mutable registers holding 2 consecutive Fibonacci numbers. So, in effect, a single step in the computation advances the Fibonacci sequence by 2 values.