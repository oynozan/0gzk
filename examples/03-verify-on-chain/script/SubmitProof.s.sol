// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console2 } from "forge-std/Script.sol";
import { stdJson } from "forge-std/StdJson.sol";

import { AgeGate } from "../src/AgeGate.sol";

/// @notice Reads a `calldata.json` produced by `pnpm build-calldata` and calls
/// `AgeGate.claim` on a previously-deployed gate.
///
///   GATE=0x... CALLDATA=./calldata.json forge script script/SubmitProof.s.sol \
///     --rpc-url $OG_RPC_URL --private-key $OG_PRIVATE_KEY --broadcast --legacy
contract SubmitProof is Script {
    using stdJson for string;

    function run() external {
        address gateAddr = vm.envAddress("GATE");
        string memory calldataPath = vm.envString("CALLDATA");
        string memory json = vm.readFile(calldataPath);

        uint256[] memory pAArr = json.readUintArray(".pA");
        uint256[] memory pB0Arr = json.readUintArray(".pB[0]");
        uint256[] memory pB1Arr = json.readUintArray(".pB[1]");
        uint256[] memory pCArr = json.readUintArray(".pC");
        uint256[] memory sigArr = json.readUintArray(".pubSignals");
        require(sigArr.length == 3, "this example expects N=3 public signals");

        uint256[2] memory pA = [pAArr[0], pAArr[1]];
        uint256[2][2] memory pB;
        pB[0] = [pB0Arr[0], pB0Arr[1]];
        pB[1] = [pB1Arr[0], pB1Arr[1]];
        uint256[2] memory pC = [pCArr[0], pCArr[1]];
        uint256[3] memory pubSignals = [sigArr[0], sigArr[1], sigArr[2]];

        vm.startBroadcast();
        AgeGate(gateAddr).claim(pA, pB, pC, pubSignals);
        vm.stopBroadcast();

        console2.log("AgeGate.claim succeeded for", msg.sender);
    }
}
