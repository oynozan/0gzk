pragma circom 2.1.6;

include "circomlib/circuits/sha256/sha256.circom";
include "circomlib/circuits/bitify.circom";

// SHA256 hash preimage proof for a fixed 32-byte (256-bit) message.
//
// SHA256 produces 256 bits which doesn't fit in a single BN128 field element
// (~254 bits), so the digest is split across two field elements:
//
//   hashHigh = bits[0..127]   (most-significant 128 bits)
//   hashLow  = bits[128..255]
//
// The same split is applied to the preimage so the prover hands in two
// 128-bit field elements rather than 256 individual bits.
//
//   1. Decompose (preimageHigh, preimageLow) into 256 bits.
//   2. Compute SHA256 over those bits.
//   3. Recompose 256 output bits into (hashHigh, hashLow) and check equality.
//
// Public:   hashHigh, hashLow
// Private:  preimageHigh, preimageLow
template Sha256PreimageShort() {
    signal input preimageHigh;
    signal input preimageLow;
    signal input hashHigh;
    signal input hashLow;

    component hi = Num2Bits(128);
    hi.in <== preimageHigh;
    component lo = Num2Bits(128);
    lo.in <== preimageLow;

    component hasher = Sha256(256);
    // Sha256 expects bits in big-endian byte order. We feed the high-half MSBs
    // first, then the low half, both with most-significant bit first, so the
    // 256-bit message matches exactly the byte layout of `bytes32`.
    for (var i = 0; i < 128; i++) {
        hasher.in[i]       <== hi.out[127 - i];
        hasher.in[128 + i] <== lo.out[127 - i];
    }

    // Recompose 256 output bits into two 128-bit halves, MSB-first.
    component hashHiBits = Num2Bits(128);
    hashHiBits.in <== hashHigh;
    component hashLoBits = Num2Bits(128);
    hashLoBits.in <== hashLow;

    for (var i = 0; i < 128; i++) {
        hasher.out[i]       === hashHiBits.out[127 - i];
        hasher.out[128 + i] === hashLoBits.out[127 - i];
    }
}

component main { public [hashHigh, hashLow] } = Sha256PreimageShort();
