pragma circom 2.1.6;

include "circomlib/circuits/eddsaposeidon.circom";
include "circomlib/circuits/poseidon.circom";

// Verifies an issuer's Baby Jubjub EdDSA signature over Poseidon(subject, claim)
// without revealing the subject. Use case: a credential issuer (e.g. KYC
// provider) signs the bound claim "subject X is verified" once; the holder
// later proves "I am subject X who was signed off by issuer P, claiming C"
// without leaking X to the verifier.
//
// The output `nullifier = Poseidon(subject, contextId)` lets a verifier track
// "this credential was used in this context" without learning the subject.
//
// Public:   issuerAx, issuerAy, claim, contextId, nullifier (output)
// Private:  subject, sigS, sigR8x, sigR8y
template EddsaCredentialCheck() {
    signal input subject;
    signal input claim;
    signal input issuerAx;
    signal input issuerAy;
    signal input sigS;
    signal input sigR8x;
    signal input sigR8y;
    signal input contextId;
    signal output nullifier;

    // Bind (subject, claim) into a single field element. The issuer signed
    // exactly this hash; nothing else.
    component msgH = Poseidon(2);
    msgH.inputs[0] <== subject;
    msgH.inputs[1] <== claim;

    component verifier = EdDSAPoseidonVerifier();
    verifier.enabled <== 1;
    verifier.Ax <== issuerAx;
    verifier.Ay <== issuerAy;
    verifier.S  <== sigS;
    verifier.R8x <== sigR8x;
    verifier.R8y <== sigR8y;
    verifier.M  <== msgH.out;

    // Per-context nullifier so the same credential can be used at most once
    // per (issuer, context) pair without linking back to the subject.
    component nullH = Poseidon(2);
    nullH.inputs[0] <== subject;
    nullH.inputs[1] <== contextId;
    nullifier <== nullH.out;
}

component main { public [issuerAx, issuerAy, claim, contextId] } = EddsaCredentialCheck();
