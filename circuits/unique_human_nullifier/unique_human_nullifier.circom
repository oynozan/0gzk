pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";

// Hashes a (left, right) pair using Poseidon-2.
template HashPair() {
    signal input left;
    signal input right;
    signal output out;

    component h = Poseidon(2);
    h.inputs[0] <== left;
    h.inputs[1] <== right;
    out <== h.out;
}

// Selects (left, right) given the current node + sibling, swapped according
// to a path-index bit (0 = current is the left child, 1 = current is right).
template SelectPair() {
    signal input current;
    signal input sibling;
    signal input bit;
    signal output left;
    signal output right;

    bit * (bit - 1) === 0;

    component muxL = Mux1();
    muxL.c[0] <== current;
    muxL.c[1] <== sibling;
    muxL.s    <== bit;
    left <== muxL.out;

    component muxR = Mux1();
    muxR.c[0] <== sibling;
    muxR.c[1] <== current;
    muxR.s    <== bit;
    right <== muxR.out;
}

// Proof of personhood: prove a private `secret` is registered in a Poseidon
// Merkle tree of registered humans, and emit a deterministic per-app nullifier
// so the same human can perform the gated action at most once per app.
//
//   leaf       = Poseidon(secret)        // secret never appears directly
//   nullifier  = Poseidon(secret, appId) // unique per (human, app) pair
//
// Public:   humansRoot, appId, nullifier (output)
// Private:  secret, pathElements[depth], pathIndices[depth]
template UniqueHumanNullifier(depth) {
    signal input secret;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal input humansRoot;
    signal input appId;
    signal output nullifier;

    component leafH = Poseidon(1);
    leafH.inputs[0] <== secret;

    component selectors[depth];
    component hashers[depth];
    signal currents[depth + 1];
    currents[0] <== leafH.out;

    for (var i = 0; i < depth; i++) {
        selectors[i] = SelectPair();
        selectors[i].current <== currents[i];
        selectors[i].sibling <== pathElements[i];
        selectors[i].bit     <== pathIndices[i];

        hashers[i] = HashPair();
        hashers[i].left  <== selectors[i].left;
        hashers[i].right <== selectors[i].right;

        currents[i + 1] <== hashers[i].out;
    }

    humansRoot === currents[depth];

    component nullH = Poseidon(2);
    nullH.inputs[0] <== secret;
    nullH.inputs[1] <== appId;
    nullifier <== nullH.out;
}

component main { public [humansRoot, appId] } = UniqueHumanNullifier(16);
