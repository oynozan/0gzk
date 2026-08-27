#!/usr/bin/env node
// node prove.mjs <name>[@<version>] [birthYear] [currentYear] [minAge]
// Defaults satisfy age_verification@0.1.0. For other circuits, edit `inputs`.

import { JsonRpcProvider } from "ethers";
import {
  getRegistryContract,
  resolveBundle,
  parseNameSpec,
} from "@0gzk/sdk/onchain";
import { fetchBundle } from "@0gzk/sdk/node";
import { generateProof, verifyLocal } from "@0gzk/sdk";

// Config
const RPC_URL = process.env.OG_RPC_URL ?? "https://evmrpc-testnet.0g.ai";
const INDEXER_URL =
  process.env.OG_INDEXER_URL ?? "https://indexer-storage-testnet-turbo.0g.ai";
const REGISTRY = process.env.OG_REGISTRY_ADDRESS;

// Inputs from argv
const [, , spec = "age_verification", birthYear = "1990", currentYear = "2026", minAge = "18"] =
  process.argv;

const inputs = {
  birthYear: Number(birthYear),
  currentYear: Number(currentYear),
  minAge: Number(minAge),
};

console.log(`spec     : ${spec}`);
console.log(`rpc      : ${RPC_URL}`);
console.log(`indexer  : ${INDEXER_URL}`);
console.log(`inputs   : ${JSON.stringify(inputs)}`);
console.log();

// 1. Resolve + fetch bundle
const provider = new JsonRpcProvider(RPC_URL);
const registry = getRegistryContract(provider, REGISTRY);

console.log("[1/3] Resolving on-chain record + downloading bundle from 0G Storage...");
const t0 = Date.now();
const { record, bundle } = await resolveBundle(
  registry,
  parseNameSpec(spec),
  (rootHash) => fetchBundle(rootHash, { indexerUrl: INDEXER_URL }),
);
console.log(
  `      version=${record.version} rootHash=${record.rootHash.slice(0, 12)}... ` +
    `verifier=${record.verifier} (${Date.now() - t0} ms)`,
);

// 2. Prove
console.log("[2/3] Generating Groth16 proof...");
const t1 = Date.now();
const proof = await generateProof(bundle, inputs);
console.log(`      done (${Date.now() - t1} ms)`);

// 3. Verify locally
console.log("[3/3] Verifying locally...");
const verified = await verifyLocal(bundle, proof);
console.log(`      verified=${verified}`);
console.log();

// Summary
const summary = {
  circuit: { name: bundle.metadata.name, version: bundle.metadata.version },
  registry: {
    rootHash: record.rootHash,
    vkeyHash: record.vkeyHash,
    verifier: record.verifier,
    publisher: record.publisher,
    publishedAt: new Date(record.publishedAt * 1000).toISOString(),
  },
  inputs,
  publicSignals: proof.publicSignals,
  verified,
};

console.log(JSON.stringify(summary, null, 2));

// 0G storage SDK leaks keep-alive sockets
process.exit(verified ? 0 : 1);
