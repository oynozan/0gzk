pragma circom 2.1.5;

// Proves: "I know two factors x, y such that x * y == out", without
// revealing x or y. `out` is the only public signal.
//
// This file is the template a new circuit author copies. Replace the body of
// Multiply with whatever constraint(s) your application needs.
template Multiply() {
    signal input x;
    signal input y;
    signal output out;

    out <== x * y;
}

component main = Multiply();
