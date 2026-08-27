pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";

template HashPair() {
    signal input left;
    signal input right;
    signal output out;

    component h = Poseidon(2);
    h.inputs[0] <== left;
    h.inputs[1] <== right;
    out <== h.out;
}

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

// Tornado-style shielded spend. Prove that:
//
//   1. leaf = Poseidon(secret, nullifierSeed) is in a depth-16 Merkle tree
//   2. nullifier = Poseidon(nullifierSeed)   // exposed publicly
//
// `recipient` is a public binding tag: the verifier's contract should require
// that the supplied recipient address matches the public input. The dummy
// quadratic constraint `recipientSq <== recipient * recipient` is what makes
// the proof actually depend on recipient (without it, a mempool watcher could
// re-broadcast your withdrawal and steal the funds).
//
// Public:   root, recipient, nullifier (output)
// Private:  secret, nullifierSeed, pathElements[depth], pathIndices[depth]
template PrivateTransfer(depth) {
    signal input secret;
    signal input nullifierSeed;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal input root;
    signal input recipient;
    signal output nullifier;

    component leafH = Poseidon(2);
    leafH.inputs[0] <== secret;
    leafH.inputs[1] <== nullifierSeed;

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

    root === currents[depth];

    component nullH = Poseidon(1);
    nullH.inputs[0] <== nullifierSeed;
    nullifier <== nullH.out;

    // Bind the proof to the recipient. Quadratic constraint, otherwise
    // recipient would be a "free" public signal an attacker could swap.
    signal recipientSq;
    recipientSq <== recipient * recipient;
}

component main { public [root, recipient] } = PrivateTransfer(16);
