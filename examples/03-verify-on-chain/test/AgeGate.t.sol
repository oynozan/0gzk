// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Test } from "forge-std/Test.sol";

import { AgeGate } from "../src/AgeGate.sol";
import { MockGroth16Verifier } from "./MockGroth16Verifier.sol";

contract AgeGateTest is Test {
    MockGroth16Verifier internal verifier;
    AgeGate internal gate;
    address internal alice = makeAddr("alice");

    function setUp() public {
        verifier = new MockGroth16Verifier();
        gate = new AgeGate(address(verifier));
    }

    function _dummyAB()
        internal
        pure
        returns (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC)
    {
        pA = [uint256(1), uint256(2)];
        pB[0] = [uint256(3), uint256(4)];
        pB[1] = [uint256(5), uint256(6)];
        pC = [uint256(7), uint256(8)];
    }

    function _adultSignals() internal pure returns (uint256[3] memory s) {
        s[0] = 1; // isAdult
        s[1] = 2026; // currentYear
        s[2] = 18; // minAge
    }

    function test_claim_succeeds_for_valid_adult_proof() public {
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _dummyAB();

        vm.prank(alice);
        gate.claim(pA, pB, pC, _adultSignals());

        assertTrue(gate.allowed(alice));
    }

    function test_claim_reverts_when_verifier_rejects() public {
        verifier.setAnswer(false);
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _dummyAB();

        vm.expectRevert(AgeGate.ProofRejected.selector);
        gate.claim(pA, pB, pC, _adultSignals());
    }

    function test_claim_reverts_when_not_adult() public {
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _dummyAB();
        uint256[3] memory signals;
        signals[0] = 0; // isAdult = 0, the proof says "I am NOT an adult"
        signals[1] = 2026;
        signals[2] = 18;

        vm.expectRevert(AgeGate.NotAnAdult.selector);
        gate.claim(pA, pB, pC, signals);
    }

    function test_emits_allowed_event() public {
        (uint256[2] memory pA, uint256[2][2] memory pB, uint256[2] memory pC) = _dummyAB();

        vm.expectEmit(true, false, false, true);
        emit AgeGate.Allowed(alice, 2026, 18);

        vm.prank(alice);
        gate.claim(pA, pB, pC, _adultSignals());
    }
}
