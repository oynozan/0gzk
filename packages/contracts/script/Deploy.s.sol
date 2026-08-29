// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console2 as console} from "forge-std/console2.sol";

import {CircuitRegistry} from "../src/CircuitRegistry.sol";

// Deploys CircuitRegistry to whichever network --rpc-url points at.
// Reads the broadcaster from $DEPLOYER_PRIVATE_KEY, falling back to the
// legacy $OG_PRIVATE_KEY.
//
// (Plain comments on purpose: solc treats any `@word` inside a natspec
// doc-comment as a tag, so the package name in the example commands below
// would fail compilation under `///`.)
//
// 0G mainnet (chain id 16661):
//   export OG_RPC_URL=https://evmrpc.0g.ai
//   export OG_PRIVATE_KEY=0x<funded_mainnet_key>
//   pnpm --filter @0gzk/contracts deploy:mainnet
//
// 0G testnet (Galileo, chain id 16602):
//   export OG_RPC_URL=https://evmrpc-testnet.0g.ai
//   export OG_PRIVATE_KEY=0x<funded_galileo_key>
//   pnpm --filter @0gzk/contracts deploy:galileo
//
// Base Sepolia (chain id 84532) / Base mainnet (chain id 8453):
//   export DEPLOYER_PRIVATE_KEY=0x<funded_base_key>
//   pnpm --filter @0gzk/contracts deploy:base-sepolia   # or deploy:base
//
// Record the printed address in registry-addresses.json under the
// appropriate chainId so the SDK + CLI can resolve it automatically.
contract Deploy is Script {
    function run() external returns (CircuitRegistry registry) {
        uint256 pk = vm.envOr("DEPLOYER_PRIVATE_KEY", uint256(0));
        if (pk == 0) pk = vm.envUint("OG_PRIVATE_KEY");
        vm.startBroadcast(pk);
        registry = new CircuitRegistry();
        vm.stopBroadcast();

        console.log("CircuitRegistry deployed at:", address(registry));
        console.log("chainId:", block.chainid);
    }
}
