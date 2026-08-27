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

// Selects (left, right) given a current node and a sibling, swapped according
// to a bit flag indicating whether the current node is the right child (1) or
// the left child (0). Uses circomlib's MultiMux1 to keep things linear.
template SelectPair() {
    signal input current;
    signal input sibling;
    signal input bit;          // 0 -> current is left, sibling is right
    signal output left;
    signal output right;

    bit * (bit - 1) === 0;     // enforce bit ∈ {0, 1}

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

// Proves: Merkle inclusion of `leaf` in a Poseidon-2 tree rooted at `root`,
// at the position encoded by `pathIndices` (LSB = bottom-most level).
//
//   - leaf, pathElements, pathIndices are private.
//   - root is public.
//
// Tree convention: each internal node N = Poseidon(left, right). The path
// climbs from leaf to root. At each level the proven node may be either the
// left or right child; pathIndices[i] picks the side.
template MerkleMembership(depth) {
    signal input leaf;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal input root;

    component selectors[depth];
    component hashers[depth];

    signal currents[depth + 1];
    currents[0] <== leaf;

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
}

component main { public [root] } = MerkleMembership(8);
