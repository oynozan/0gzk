pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

// Proves: Poseidon([preimage]) == hash
//
//   - preimage is private; hash is public.
//   - Smallest possible privacy circuit. Useful as a hello-world fixture and
//     as the building block under more complex commitments.
//   - Uses 1-input Poseidon for parity with the way circomlib hashes single
//     field elements throughout the rest of the 0gzk circuit collection.
template PoseidonPreimage() {
    signal input preimage;
    signal input hash;

    component hasher = Poseidon(1);
    hasher.inputs[0] <== preimage;

    hash === hasher.out;
}

component main { public [hash] } = PoseidonPreimage();
