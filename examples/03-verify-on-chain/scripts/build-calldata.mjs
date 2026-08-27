#!/usr/bin/env node
// Convert snarkjs proof.json + public.json into the calldata shape expected
// by the Groth16 verifier and SubmitProof.s.sol.
//
//   node scripts/build-calldata.mjs <proof.json> <public.json> [out=./calldata.json]
//
// The two inputs typically come from `node ../01-prove-in-node/prove.mjs ...`,
// which drops them into a fresh `proof-<timestamp>/` directory.

import { promises as fs } from "node:fs";
import * as path from "node:path";

import { groth16 } from "snarkjs";

const [, , proofPath, publicPath, outPath] = process.argv;
if (!proofPath || !publicPath) {
  console.error("Usage: node scripts/build-calldata.mjs <proof.json> <public.json> [out]");
  process.exit(1);
}

const proof = JSON.parse(await fs.readFile(proofPath, "utf8"));
const publicSignals = JSON.parse(await fs.readFile(publicPath, "utf8"));

// snarkjs returns a comma-separated string of [pA[2], pB[2][2], pC[2], pubSignals[N]].
const callDataStr = await groth16.exportSolidityCallData(proof, publicSignals);
const [pA, pB, pC, pubSignalsArr] = JSON.parse(`[${callDataStr}]`);

const out = outPath ?? path.join(path.dirname(publicPath), "calldata.json");
await fs.writeFile(out, JSON.stringify({ pA, pB, pC, pubSignals: pubSignalsArr }, null, 2));
console.log(`wrote ${out}`);
