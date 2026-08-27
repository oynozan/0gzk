#!/usr/bin/env node
// CircuitRegistry phone-book: given <name>[@<version>], print every field of
// the on-chain record plus an explorer link. Read-only; no key required.
//
//   node resolve.mjs <name>[@<version>]

import { JsonRpcProvider } from "ethers";
import {
  getRegistryContract,
  getVersion,
  getLatest,
  parseNameSpec,
} from "@0gzk/sdk/onchain";

// Works against any chain carrying a CircuitRegistry. Defaults target 0G
// Galileo; for Base Sepolia set e.g.
//   OG_RPC_URL=https://sepolia.base.org OG_CHAIN_ID=84532 \
//   OG_EXPLORER=https://sepolia.basescan.org node resolve.mjs age_verification
const RPC_URL = process.env.OG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
const EXPLORER = process.env.OG_EXPLORER ?? "https://chainscan-galileo.0g.ai";
const REGISTRY = process.env.OG_REGISTRY_ADDRESS;
const CHAIN_ID = process.env.OG_CHAIN_ID ? Number(process.env.OG_CHAIN_ID) : undefined;

const spec = process.argv[2] ?? "poseidon_preimage";
const parsed = parseNameSpec(spec);

const provider = new JsonRpcProvider(RPC_URL);
const registry = CHAIN_ID
  ? getRegistryContract(provider, REGISTRY, CHAIN_ID)
  : getRegistryContract(provider, REGISTRY);

const { version, record } = parsed.version
  ? { version: parsed.version, record: await getVersion(registry, parsed.name, parsed.version) }
  : await getLatest(registry, parsed.name);

const summary = {
  name: parsed.name,
  version,
  rootHash: record.rootHash,
  vkeyHash: record.vkeyHash,
  verifier: record.verifier,
  publisher: record.publisher,
  publishedAt: new Date(record.publishedAt * 1000).toISOString(),
  metadataURI: record.metadataURI,
  links: {
    publisher: `${EXPLORER}/address/${record.publisher}`,
    verifier:
      record.verifier === "0x0000000000000000000000000000000000000000"
        ? null
        : `${EXPLORER}/address/${record.verifier}`,
    registry: `${EXPLORER}/address/${await registry.getAddress()}`,
  },
};

console.log(JSON.stringify(summary, null, 2));

if (!/^0x[0-9a-fA-F]{64}$/.test(record.rootHash) || record.rootHash === `0x${"0".repeat(64)}`) {
  console.error("\nrootHash is empty - circuit not registered.");
  process.exit(1);
}
