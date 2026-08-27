pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

// Proof of reserves over N committed balances. Prove that:
//
//   1. For every i in 0..N: Poseidon(balances[i], salts[i]) == commitments[i]
//   2. sum(balances) >= threshold
//
// Each balance is bounded to 64 bits to prevent field overflow when summed
// (16 * 64 = 68 bits worst case, well under the BN128 prime).
//
// Public:   commitments[N], threshold
// Private:  balances[N], salts[N]
template SolvencyAttestation(N) {
    signal input balances[N];
    signal input salts[N];
    signal input commitments[N];
    signal input threshold;

    component openers[N];
    component balanceBits[N];
    var sum = 0;

    for (var i = 0; i < N; i++) {
        // Open the i-th commitment.
        openers[i] = Poseidon(2);
        openers[i].inputs[0] <== balances[i];
        openers[i].inputs[1] <== salts[i];
        commitments[i] === openers[i].out;

        // Range-check each balance so the sum cannot wrap the field.
        balanceBits[i] = Num2Bits(64);
        balanceBits[i].in <== balances[i];

        sum += balances[i];
    }

    // Bound the threshold to 64 bits so GreaterEqThan stays sound.
    component thresholdBits = Num2Bits(64);
    thresholdBits.in <== threshold;

    // sum is at most 16*(2^64 - 1) ≈ 2^68; GreaterEqThan(72) is more than
    // enough headroom and still cheap.
    component gte = GreaterEqThan(72);
    gte.in[0] <== sum;
    gte.in[1] <== threshold;
    gte.out === 1;
}

component main { public [commitments, threshold] } = SolvencyAttestation(16);
