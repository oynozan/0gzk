#!/usr/bin/env node
// Derive a working { preimage, hash } pair for the poseidon_preimage circuit.
//
//   node derive_input.mjs            # uses preimage=1
//   node derive_input.mjs 12345      # uses preimage=12345
//
// Writes the result to example_input.json next to this script.

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPoseidon } from "circomlibjs";

const here = dirname(fileURLToPath(import.meta.url));
const preimage = process.argv[2] ?? "1";

const poseidon = await buildPoseidon();
const hash = poseidon.F.toString(poseidon([BigInt(preimage)]));

const input = { preimage: String(preimage), hash };
const target = resolve(here, "example_input.json");
writeFileSync(target, `${JSON.stringify(input, null, 2)}\n`);

console.log("wrote", target);
console.log(input);
