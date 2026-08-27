// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice snarkjs-style Groth16 verifier specialized for circuits with three
/// public signals. The number of public signals is baked into the verifier at
/// `snarkjs zkey export solidityverifier` time, so this interface only fits
/// circuits whose `metadata.json` declares exactly 3 public outputs (any mix
/// of `public` inputs + circuit outputs).
///
/// `age_verification` v0.1.0 produces `[isAdult, currentYear, minAge]`, which
/// is why this example targets it. For your own circuit, copy this file, swap
/// `uint[3]` to whatever N you need, and re-export from the bundle's
/// verifier.sol.
interface IGroth16VerifierN3 {
    function verifyProof(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[3] calldata pubSignals
    ) external view returns (bool);
}
