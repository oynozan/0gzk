// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {CircuitRegistry} from "../src/CircuitRegistry.sol";

contract CircuitRegistryTest is Test {
    CircuitRegistry internal reg;

    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal verifier1 = makeAddr("verifier1");
    address internal verifier2 = makeAddr("verifier2");

    bytes32 internal constant ROOT_1 = bytes32(uint256(0xa1));
    bytes32 internal constant ROOT_2 = bytes32(uint256(0xa2));
    bytes32 internal constant VKEY_1 = bytes32(uint256(0xb1));
    bytes32 internal constant VKEY_2 = bytes32(uint256(0xb2));

    function setUp() public {
        reg = new CircuitRegistry();
    }

    /*//////////////////////////////////////////////////////////////
                          createCircuit
    //////////////////////////////////////////////////////////////*/

    function test_createCircuit_setsOwnerAndExists() public {
        vm.prank(alice);
        reg.createCircuit("age_verification");

        assertTrue(reg.exists("age_verification"));
        assertEq(reg.ownerOf("age_verification"), alice);
        assertEq(reg.circuitCount(), 1);
    }

    function test_createCircuit_revertsOnDuplicateClaim() public {
        vm.prank(alice);
        reg.createCircuit("age_verification");

        vm.expectRevert(
            abi.encodeWithSelector(CircuitRegistry.NameAlreadyClaimed.selector, "age_verification")
        );
        vm.prank(bob);
        reg.createCircuit("age_verification");
    }

    function test_createCircuit_rejectsInvalidNames() public {
        string[6] memory bad = ["A", "ab", "WithCaps", "with space", unicode"unicodé", ""];
        // "ab" is the only valid one above; we filter it out below.
        for (uint256 i = 0; i < bad.length; i++) {
            if (keccak256(bytes(bad[i])) == keccak256(bytes("ab"))) continue;
            vm.expectRevert();
            reg.createCircuit(bad[i]);
        }
    }

    function test_createCircuit_acceptsAllowedAlphabet() public {
        reg.createCircuit("ab");
        reg.createCircuit("a-b_2");
        reg.createCircuit("0123456789");
    }

    function test_createCircuit_rejectsTooLongName() public {
        string memory tooLong = "abcdefghijklmnopqrstuvwxyz0123456_"; // 34 chars
        vm.expectRevert();
        reg.createCircuit(tooLong);
    }

    /*//////////////////////////////////////////////////////////////
                          publishVersion
    //////////////////////////////////////////////////////////////*/

    function _claimAsAlice() internal {
        vm.prank(alice);
        reg.createCircuit("age_verification");
    }

    function test_publishVersion_writesImmutableRecord() public {
        _claimAsAlice();

        vm.prank(alice);
        reg.publishVersion(
            "age_verification",
            "0.1.0",
            ROOT_1,
            VKEY_1,
            verifier1,
            "ipfs://meta"
        );

        CircuitRegistry.Version memory v = reg.getVersion("age_verification", "0.1.0");
        assertEq(v.rootHash, ROOT_1);
        assertEq(v.vkeyHash, VKEY_1);
        assertEq(v.verifier, verifier1);
        assertEq(v.publisher, alice);
        assertGt(v.publishedAt, 0);
        assertEq(v.metadataURI, "ipfs://meta");

        string[] memory versions = reg.listVersions("age_verification");
        assertEq(versions.length, 1);
        assertEq(versions[0], "0.1.0");
    }

    function test_publishVersion_revertsForNonOwner() public {
        _claimAsAlice();
        vm.expectRevert(
            abi.encodeWithSelector(CircuitRegistry.NotOwner.selector, "age_verification", bob)
        );
        vm.prank(bob);
        reg.publishVersion("age_verification", "0.1.0", ROOT_1, VKEY_1, verifier1, "");
    }

    function test_publishVersion_revertsIfCircuitMissing() public {
        vm.expectRevert(
            abi.encodeWithSelector(CircuitRegistry.CircuitNotFound.selector, "ghost")
        );
        vm.prank(alice);
        reg.publishVersion("ghost", "0.1.0", ROOT_1, VKEY_1, verifier1, "");
    }

    function test_publishVersion_revertsOnDuplicateVersion() public {
        _claimAsAlice();
        vm.startPrank(alice);
        reg.publishVersion("age_verification", "0.1.0", ROOT_1, VKEY_1, verifier1, "");

        vm.expectRevert(
            abi.encodeWithSelector(
                CircuitRegistry.VersionAlreadyPublished.selector,
                "age_verification",
                "0.1.0"
            )
        );
        reg.publishVersion("age_verification", "0.1.0", ROOT_2, VKEY_2, verifier2, "");
        vm.stopPrank();
    }

    function test_publishVersion_revertsOnZeroRootHash() public {
        _claimAsAlice();
        vm.expectRevert(CircuitRegistry.ZeroRootHash.selector);
        vm.prank(alice);
        reg.publishVersion("age_verification", "0.1.0", bytes32(0), VKEY_1, verifier1, "");
    }

    function test_publishVersion_revertsOnZeroVkeyHash() public {
        _claimAsAlice();
        vm.expectRevert(CircuitRegistry.ZeroVkeyHash.selector);
        vm.prank(alice);
        reg.publishVersion("age_verification", "0.1.0", ROOT_1, bytes32(0), verifier1, "");
    }

    function test_publishVersion_acceptsZeroVerifier() public {
        _claimAsAlice();
        vm.prank(alice);
        reg.publishVersion("age_verification", "0.1.0", ROOT_1, VKEY_1, address(0), "");
        assertEq(reg.getVersion("age_verification", "0.1.0").verifier, address(0));
    }

    function test_publishVersion_rejectsInvalidVersionString() public {
        _claimAsAlice();
        vm.expectRevert();
        vm.prank(alice);
        reg.publishVersion("age_verification", "", ROOT_1, VKEY_1, verifier1, "");

        vm.expectRevert();
        vm.prank(alice);
        reg.publishVersion("age_verification", "with space", ROOT_1, VKEY_1, verifier1, "");
    }

    /*//////////////////////////////////////////////////////////////
                            setVerifier
    //////////////////////////////////////////////////////////////*/

    function test_setVerifier_replacesAddress() public {
        _claimAsAlice();
        vm.startPrank(alice);
        reg.publishVersion("age_verification", "0.1.0", ROOT_1, VKEY_1, address(0), "");
        reg.setVerifier("age_verification", "0.1.0", verifier1);
        vm.stopPrank();

        assertEq(reg.getVersion("age_verification", "0.1.0").verifier, verifier1);

        vm.prank(alice);
        reg.setVerifier("age_verification", "0.1.0", verifier2);
        assertEq(reg.getVersion("age_verification", "0.1.0").verifier, verifier2);
    }

    function test_setVerifier_revertsForNonOwner() public {
        _claimAsAlice();
        vm.prank(alice);
        reg.publishVersion("age_verification", "0.1.0", ROOT_1, VKEY_1, address(0), "");

        vm.expectRevert(
            abi.encodeWithSelector(CircuitRegistry.NotOwner.selector, "age_verification", bob)
        );
        vm.prank(bob);
        reg.setVerifier("age_verification", "0.1.0", verifier1);
    }

    function test_setVerifier_revertsForUnknownVersion() public {
        _claimAsAlice();
        vm.expectRevert(
            abi.encodeWithSelector(
                CircuitRegistry.VersionNotFound.selector,
                "age_verification",
                "0.1.0"
            )
        );
        vm.prank(alice);
        reg.setVerifier("age_verification", "0.1.0", verifier1);
    }

    function test_setVerifier_rejectsZeroAddress() public {
        _claimAsAlice();
        vm.startPrank(alice);
        reg.publishVersion("age_verification", "0.1.0", ROOT_1, VKEY_1, verifier1, "");
        vm.expectRevert(CircuitRegistry.ZeroAddress.selector);
        reg.setVerifier("age_verification", "0.1.0", address(0));
        vm.stopPrank();
    }

    /*//////////////////////////////////////////////////////////////
                          transferOwner
    //////////////////////////////////////////////////////////////*/

    function test_transferOwner_changesOwner() public {
        _claimAsAlice();
        vm.prank(alice);
        reg.transferOwner("age_verification", bob);
        assertEq(reg.ownerOf("age_verification"), bob);

        // bob can publish; alice cannot.
        vm.prank(bob);
        reg.publishVersion("age_verification", "1.0.0", ROOT_1, VKEY_1, verifier1, "");

        vm.expectRevert(
            abi.encodeWithSelector(CircuitRegistry.NotOwner.selector, "age_verification", alice)
        );
        vm.prank(alice);
        reg.publishVersion("age_verification", "1.1.0", ROOT_2, VKEY_2, verifier2, "");
    }

    function test_transferOwner_rejectsZeroAddress() public {
        _claimAsAlice();
        vm.expectRevert(CircuitRegistry.ZeroAddress.selector);
        vm.prank(alice);
        reg.transferOwner("age_verification", address(0));
    }

    function test_transferOwner_revertsForNonOwner() public {
        _claimAsAlice();
        vm.expectRevert(
            abi.encodeWithSelector(CircuitRegistry.NotOwner.selector, "age_verification", bob)
        );
        vm.prank(bob);
        reg.transferOwner("age_verification", bob);
    }

    /*//////////////////////////////////////////////////////////////
                           getLatest / paging
    //////////////////////////////////////////////////////////////*/

    function test_getLatest_returnsMostRecent() public {
        _claimAsAlice();
        vm.startPrank(alice);
        reg.publishVersion("age_verification", "0.1.0", ROOT_1, VKEY_1, verifier1, "");
        reg.publishVersion("age_verification", "0.2.0", ROOT_2, VKEY_2, verifier2, "uri2");
        vm.stopPrank();

        (string memory v, CircuitRegistry.Version memory rec) = reg.getLatest("age_verification");
        assertEq(v, "0.2.0");
        assertEq(rec.rootHash, ROOT_2);
        assertEq(rec.metadataURI, "uri2");
    }

    function test_getLatest_revertsWithoutVersions() public {
        _claimAsAlice();
        vm.expectRevert();
        reg.getLatest("age_verification");
    }

    function test_listCircuits_paging() public {
        for (uint256 i = 0; i < 5; i++) {
            string memory n = string(abi.encodePacked("c", _digit(i)));
            vm.prank(alice);
            reg.createCircuit(n);
        }

        CircuitRegistry.CircuitSummary[] memory page1 = reg.listCircuits(0, 2);
        assertEq(page1.length, 2);
        assertEq(page1[0].name, "c0");
        assertEq(page1[0].owner, alice);
        assertEq(page1[1].name, "c1");

        CircuitRegistry.CircuitSummary[] memory page2 = reg.listCircuits(2, 2);
        assertEq(page2.length, 2);
        assertEq(page2[0].name, "c2");
        assertEq(page2[1].name, "c3");

        // tail clamps when limit overshoots
        CircuitRegistry.CircuitSummary[] memory tail = reg.listCircuits(4, 10);
        assertEq(tail.length, 1);
        assertEq(tail[0].name, "c4");

        // out-of-range returns empty
        assertEq(reg.listCircuits(99, 10).length, 0);
        // zero limit returns empty
        assertEq(reg.listCircuits(0, 0).length, 0);
    }

    function test_listCircuits_summaryReportsLatestVersion() public {
        _claimAsAlice();
        vm.startPrank(alice);
        reg.publishVersion("age_verification", "0.1.0", ROOT_1, VKEY_1, verifier1, "");
        reg.publishVersion("age_verification", "0.2.0", ROOT_2, VKEY_2, verifier2, "");
        vm.stopPrank();

        CircuitRegistry.CircuitSummary[] memory page = reg.listCircuits(0, 10);
        assertEq(page.length, 1);
        assertEq(page[0].versionCount, 2);
        assertEq(page[0].latestVersion, "0.2.0");
    }

    function _digit(uint256 i) internal pure returns (bytes1) {
        require(i < 10, "digit");
        return bytes1(uint8(0x30) + uint8(i));
    }
}
