// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IGroth16VerifierN3 } from "./interfaces/IGroth16Verifier.sol";

/// @title AgeGate
/// @notice Tiny demo consumer of the 0gzk `age_verification` circuit. Anyone
///         can prove they were born early enough to satisfy `currentYear -
///         birthYear >= minAge` without revealing their actual birth year.
/// @dev    The verifier address is what `CircuitRegistry.getVersion` for
///         (age_verification, 0.1.0) returns once `setVerifier` is called
///         for that version. Until then the consumer has to deploy the
///         verifier themselves (see README).
contract AgeGate {
    IGroth16VerifierN3 public immutable VERIFIER;

    /// @dev Indices inside `pubSignals` match the order of public outputs +
    /// public inputs in age_verification.circom, which snarkjs lays out as
    /// [isAdult, currentYear, minAge].
    uint256 public constant IS_ADULT_INDEX = 0;
    uint256 public constant CURRENT_YEAR_INDEX = 1;
    uint256 public constant MIN_AGE_INDEX = 2;

    mapping(address => bool) public allowed;

    event Allowed(address indexed who, uint256 currentYear, uint256 minAge);

    error ProofRejected();
    error NotAnAdult();

    constructor(address verifier) {
        VERIFIER = IGroth16VerifierN3(verifier);
    }

    /// @notice Submit an age_verification proof. On success, `msg.sender` is
    ///         marked allowed.
    /// @param  pA           snarkjs `proof.pi_a` truncated to [x, y]
    /// @param  pB           snarkjs `proof.pi_b` (Fp2 element, 2x2 matrix)
    /// @param  pC           snarkjs `proof.pi_c` truncated to [x, y]
    /// @param  pubSignals   [isAdult, currentYear, minAge] from public.json
    function claim(
        uint256[2] calldata pA,
        uint256[2][2] calldata pB,
        uint256[2] calldata pC,
        uint256[3] calldata pubSignals
    ) external {
        if (!VERIFIER.verifyProof(pA, pB, pC, pubSignals)) revert ProofRejected();
        if (pubSignals[IS_ADULT_INDEX] != 1) revert NotAnAdult();

        allowed[msg.sender] = true;
        emit Allowed(msg.sender, pubSignals[CURRENT_YEAR_INDEX], pubSignals[MIN_AGE_INDEX]);
    }
}
