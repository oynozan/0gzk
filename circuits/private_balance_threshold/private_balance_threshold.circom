pragma circom 2.1.6;

include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/poseidon.circom";

// Proves: I know `balance` and `salt` such that
//
//     Poseidon([balance, salt]) == commitment   AND   balance >= threshold
//
//   - balance and salt are private; commitment and threshold are public.
//   - balance and threshold are constrained to 64 bits (covers any realistic
//     wei/USDC/native-asset balance and keeps GreaterEqThan small).
//   - The commitment scheme matches a public on-chain anchor: an off-chain
//     party (say, an exchange or wallet attestation service) can publish
//     Poseidon([balance, salt]) for a user, and the user later proves "I'm
//     above threshold X" without revealing balance or salt.
template PrivateBalanceThreshold() {
    signal input balance;
    signal input salt;
    signal input commitment;
    signal input threshold;

    component commit = Poseidon(2);
    commit.inputs[0] <== balance;
    commit.inputs[1] <== salt;
    commitment === commit.out;

    component balanceBits = Num2Bits(64);
    balanceBits.in <== balance;

    component thresholdBits = Num2Bits(64);
    thresholdBits.in <== threshold;

    component gte = GreaterEqThan(64);
    gte.in[0] <== balance;
    gte.in[1] <== threshold;
    gte.out === 1;
}

component main { public [commitment, threshold] } = PrivateBalanceThreshold();
