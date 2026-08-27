// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IGroth16Verifier
/// @notice Minimal interface implemented by snarkjs-generated Groth16 verifiers
///         when the circuit has a public output (the `_pubSignals` array length
///         equals the circuit's public-signal count).
///
/// snarkjs emits both `verifyProof(...)` (this signature) and a `verifyTx`
/// helper. We only need the pure read function here; consumers can cast a
/// deployed verifier address to this interface to type-check on-chain calls.
interface IGroth16Verifier {
    /// @param _pA  Compressed proof element A (uint[2])
    /// @param _pB  Compressed proof element B (uint[2][2])
    /// @param _pC  Compressed proof element C (uint[2])
    /// @param _pubSignals  Concatenated outputs followed by public inputs
    /// @return ok True iff the proof is valid for the given public signals
    function verifyProof(
        uint256[2] calldata _pA,
        uint256[2][2] calldata _pB,
        uint256[2] calldata _pC,
        uint256[] calldata _pubSignals
    ) external view returns (bool ok);
}
