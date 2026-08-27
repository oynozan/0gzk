#!/usr/bin/env node
// Derive working { balance, salt, commitment, threshold } inputs.
//
//   node derive_input.mjs                            # defaults
//   node derive_input.mjs <balance> <salt> <threshold>
//
// Writes the result to example_input.json next to this script.

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPoseidon } from "circomlibjs";

const here = dirname(fileURLToPath(import.meta.url));

const balance = BigInt(process.argv[2] ?? "1000000");
const salt = BigInt(process.argv[3] ?? "12345");
const threshold = BigInt(process.argv[4] ?? "100000");

if (balance < threshold) {
  throw new Error(`balance (${balance}) must be >= threshold (${threshold})`);
}

const poseidon = await buildPoseidon();
const commitment = poseidon.F.toString(poseidon([balance, salt]));

const input = {
  balance: balance.toString(),
  salt: salt.toString(),
  commitment,
  threshold: threshold.toString(),
};

const target = resolve(here, "example_input.json");
writeFileSync(target, `${JSON.stringify(input, null, 2)}\n`);

console.log("wrote", target);
console.log(input);
