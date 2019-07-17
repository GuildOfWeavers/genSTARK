# Demo STARKs

This directory contains examples demonstrating different features of the library. The examples are described below.

## Static registers

This example shows how different types of static registers can be used. The transition function is very simple: it operates with 1 mutable register and 2 readonly registers. The full execution trace is shown at the end of this file.

## Input registers

This example shows how different types of input registers can be used. The transition function is the same as in the static register example, but the values for the readonly registers are supplied via public and secret inputs (rather than being static).

## Conditional expressions

This example shows how conditional expressions can be used to specify different branches of execution function and transition constraints. The example demonstrates both ternary conditional operator and `when...else` statement.

# Fibonacci
This example shows how to create a STARK to verify computation of Fibonacci numbers. Because a Fibonacci number depends on 2 values preceding it, we set up the STARK with 2 mutable registers holding 2 consecutive Fibonacci numbers. So, in effect, a single step in the computation advances the Fibonacci sequence by 2 values.