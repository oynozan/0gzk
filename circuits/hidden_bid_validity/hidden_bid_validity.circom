pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/comparators.circom";
include "circomlib/circuits/bitify.circom";

// Sealed-bid auction primitive. Prove that a private `bid` is in the published
// `[minBid, maxBid]` range AND opens a previously committed Poseidon hash.
// The bidder publishes `commitment = Poseidon(bid, salt)` ahead of time, then
// proves validity at settlement without revealing the bid (until the contract
// asks for the reveal in the second phase).
//
//   1. commitment === Poseidon(bid, salt)
//   2. minBid <= bid <= maxBid
//
// Public:   commitment, minBid, maxBid
// Private:  bid, salt
template HiddenBidValidity() {
    signal input bid;
    signal input salt;
    signal input commitment;
    signal input minBid;
    signal input maxBid;

    component opener = Poseidon(2);
    opener.inputs[0] <== bid;
    opener.inputs[1] <== salt;
    commitment === opener.out;

    // Force bid into 64 bits before comparing; both bounds the same.
    component bidBits = Num2Bits(64);
    bidBits.in <== bid;
    component minBits = Num2Bits(64);
    minBits.in <== minBid;
    component maxBits = Num2Bits(64);
    maxBits.in <== maxBid;

    component lo = GreaterEqThan(64);
    lo.in[0] <== bid;
    lo.in[1] <== minBid;
    lo.out === 1;

    component hi = LessEqThan(64);
    hi.in[0] <== bid;
    hi.in[1] <== maxBid;
    hi.out === 1;
}

component main { public [commitment, minBid, maxBid] } = HiddenBidValidity();
