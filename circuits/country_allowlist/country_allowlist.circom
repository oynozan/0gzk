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

// Jurisdiction gating without geo-fingerprinting. Prove that:
//
//   1. commitment == Poseidon(countryCode, salt)   // opens the user's binding
//   2. Poseidon(countryCode) is a leaf at the supplied path in `allowlistRoot`
//
// Both `commitment` and `allowlistRoot` are public, so a verifier can convince
// themselves the user belongs to one of the published countries without ever
// learning which one.
//
// The allowlist publisher constructs the tree from leaves Poseidon(c) for each
// allowed country code c (ISO numeric or any agreed encoding).
template CountryAllowlist(depth) {
    signal input countryCode;
    signal input salt;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal input commitment;
    signal input allowlistRoot;

    component commit = Poseidon(2);
    commit.inputs[0] <== countryCode;
    commit.inputs[1] <== salt;
    commitment === commit.out;

    component leafH = Poseidon(1);
    leafH.inputs[0] <== countryCode;

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

    allowlistRoot === currents[depth];
}

component main { public [commitment, allowlistRoot] } = CountryAllowlist(8);
