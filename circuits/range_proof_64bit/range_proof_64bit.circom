pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/bitify.circom";

// Canonical "I know an x in [0, 2^64) that opens commitment". Tiny circuit
// designed to be cited by other systems that just need a private 64-bit
// integer with a public anchor.
//
//   1. commitment === Poseidon(x, salt)
//   2. 0 <= x < 2^64
//
// Public:   commitment
// Private:  x, salt
template RangeProof64Bit() {
    signal input x;
    signal input salt;
    signal input commitment;

    component opener = Poseidon(2);
    opener.inputs[0] <== x;
    opener.inputs[1] <== salt;
    commitment === opener.out;

    component bits = Num2Bits(64);
    bits.in <== x;
}

component main { public [commitment] } = RangeProof64Bit();
