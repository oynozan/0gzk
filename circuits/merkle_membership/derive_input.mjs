#!/usr/bin/env node
// Derive a working set of merkle_membership inputs for a given (leaf, position)
// against a freshly-built depth-8 Poseidon-2 tree of `2**8` leaves.
//
//   node derive_input.mjs                  # leaf=42, position=5
//   node derive_input.mjs <leaf> <position>
//
// Writes the result to example_input.json next to this script.

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildPoseidon } from "circomlibjs";

const here = dirname(fileURLToPath(import.meta.url));

const DEPTH = 8;
const LEAVES = 1 << DEPTH;

const leafArg = BigInt(process.argv[2] ?? "42");
const positionArg = Number(process.argv[3] ?? "5");
if (positionArg < 0 || positionArg >= LEAVES || !Number.isInteger(positionArg)) {
  throw new Error(`position must be an integer in [0, ${LEAVES})`);
}

const poseidon = await buildPoseidon();
const F = poseidon.F;
const hashPair = (l, r) => poseidon([l, r]);

// Build a tree with deterministic leaves: leaf[i] = i + 1, except at our
// chosen position where we drop the user's leaf in. Tree levels stored
// bottom-up; level[0] = leaves.
//
// Every level entry must be a Wasm field element (Uint8Array). `hashPair`
// already returns one for d >= 1, so we normalize the leaves with `F.e` to
// match — otherwise `F.toString(<BigInt>)` later throws
// `Cannot convert a BigInt value to a number` from inside ffjavascript.
const levels = [[]];
for (let i = 0; i < LEAVES; i++) {
  const value = i === positionArg ? leafArg : BigInt(i + 1);
  levels[0].push(F.e(value));
}
for (let d = 0; d < DEPTH; d++) {
  const prev = levels[d];
  const next = [];
  for (let i = 0; i < prev.length; i += 2) {
    next.push(hashPair(prev[i], prev[i + 1]));
  }
  levels.push(next);
}

let index = positionArg;
const pathElements = [];
const pathIndices = [];
for (let d = 0; d < DEPTH; d++) {
  const isRight = index & 1;
  const siblingIdx = isRight ? index - 1 : index + 1;
  pathElements.push(F.toString(levels[d][siblingIdx]));
  pathIndices.push(isRight);
  index = index >> 1;
}

const input = {
  leaf: leafArg.toString(),
  pathElements,
  pathIndices: pathIndices.map((b) => b.toString()),
  root: F.toString(levels[DEPTH][0]),
};

const target = resolve(here, "example_input.json");
writeFileSync(target, `${JSON.stringify(input, null, 2)}\n`);

console.log("wrote", target);
console.log({ leaf: input.leaf, root: input.root, position: positionArg });
