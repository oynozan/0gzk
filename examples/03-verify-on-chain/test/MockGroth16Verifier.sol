// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IGroth16VerifierN3 } from "../src/interfaces/IGroth16Verifier.sol";

/// @notice Test stub returning whatever `answer` is dialed in. Lets us
/// exercise AgeGate's reverts deterministically without a real proof. Not
/// for production - any caller can flip the answer.
contract MockGroth16Verifier is IGroth16VerifierN3 {
    bool public answer = true;

    function setAnswer(bool a) external {
        answer = a;
    }

    function verifyProof(
        uint256[2] calldata,
        uint256[2][2] calldata,
        uint256[2] calldata,
        uint256[3] calldata
    ) external view returns (bool) {
        return answer;
    }
}
