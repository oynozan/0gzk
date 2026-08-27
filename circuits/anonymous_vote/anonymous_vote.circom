pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";
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

// Anonymous vote with one-vote-per-eligible-voter enforcement.
//
//   1. leaf = Poseidon(voterSecret) is in the depth-16 voters tree
//   2. nullifier = Poseidon(voterSecret, ballotId) is unique per voter+ballot
//   3. vote in [0, K) where K is the number of options (8 here)
//
// `revealedVote` exposes the vote publicly so a tally contract can sum it,
// while keeping the voter's identity hidden behind voterSecret + nullifier.
//
// Public:   votersRoot, ballotId, nullifier (output), revealedVote (output)
// Private:  voterSecret, vote, pathElements[depth], pathIndices[depth]
template AnonymousVote(depth, K) {
    signal input voterSecret;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal input vote;
    signal input votersRoot;
    signal input ballotId;
    signal output nullifier;
    signal output revealedVote;

    component leafH = Poseidon(1);
    leafH.inputs[0] <== voterSecret;

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

    votersRoot === currents[depth];

    // vote ∈ [0, K). Constrain to 8 bits so LessThan stays sound, then
    // assert vote < K. K is a compile-time constant.
    component voteBits = Num2Bits(8);
    voteBits.in <== vote;
    component voteRange = LessThan(8);
    voteRange.in[0] <== vote;
    voteRange.in[1] <== K;
    voteRange.out === 1;

    component nullH = Poseidon(2);
    nullH.inputs[0] <== voterSecret;
    nullH.inputs[1] <== ballotId;
    nullifier <== nullH.out;

    revealedVote <== vote;
}

component main { public [votersRoot, ballotId] } = AnonymousVote(16, 8);
