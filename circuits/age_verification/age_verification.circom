pragma circom 2.1.6;

include "circomlib/circuits/comparators.circom";

// Proves: (currentYear - birthYear) >= minAge
// - birthYear is private; currentYear and minAge are public.
// - 8-bit GreaterEqThan is sufficient for realistic age values (0..255).
template AgeVerification() {
    signal input birthYear;
    signal input currentYear;
    signal input minAge;
    signal output isAdult;

    signal age <== currentYear - birthYear;

    component gte = GreaterEqThan(8);
    gte.in[0] <== age;
    gte.in[1] <== minAge;

    isAdult <== gte.out;
}

component main { public [currentYear, minAge] } = AgeVerification();
