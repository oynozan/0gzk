// Generates example_input.json files for the 10 circuits added in v0.4.
// Run from the repo root with `node circuits/_lib/gen_examples.mjs`. Idempotent.
//
// Uses circomlibjs's Poseidon, EdDSA, and Babyjub helpers so the produced
// witnesses match what the circuits compute. Inputs are chosen for readability
// (small secrets, friendly indices) — these are NOT meant to be secure.

import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

import { buildPoseidon, buildEddsa } from "circomlibjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CIRCUITS_DIR = resolve(REPO_ROOT, "circuits");

const poseidon = await buildPoseidon();
const eddsa = await buildEddsa();
const F = poseidon.F;

// Convenience: returns a decimal string for a Poseidon/Babyjub field element.
const fs = (x) => F.toObject(x).toString();

// Poseidon(args...) -> decimal string field element. Accepts JS numbers,
// bigints, or already-formatted decimal strings.
function pos(...args) {
  const inputs = args.map((a) => (typeof a === "bigint" ? a : BigInt(a)));
  return fs(poseidon(inputs));
}

// Build a Poseidon Merkle tree over `leaves` (decimal strings or bigints).
// Returns { root, layers } where layers[0] = leaves and layers[depth] = [root].
// `depth` levels of internal nodes are produced; tree is power-of-two padded
// with the literal `0` field element at every level (the same convention the
// circom merkle templates use when paths terminate against an empty subtree).
function buildMerkleTree(leaves, depth) {
  let layer = leaves.map((l) =>
    typeof l === "bigint" ? l : BigInt(l),
  );
  const layers = [layer.map((b) => b.toString())];
  for (let level = 0; level < depth; level++) {
    const next = [];
    for (let i = 0; i < layer.length; i += 2) {
      const l = layer[i];
      const r = i + 1 < layer.length ? layer[i + 1] : 0n;
      next.push(BigInt(pos(l, r)));
    }
    layer = next;
    layers.push(layer.map((b) => b.toString()));
  }
  // The "next" loop halves the layer, but we want a tree of fixed depth even
  // if the leaf count is much smaller than 2^depth. Pad up by chaining
  // zero-hashes for the remaining levels.
  while (layers.length - 1 < depth) {
    const last = BigInt(layers[layers.length - 1][0]);
    const next = BigInt(pos(last, 0n));
    layers.push([next.toString()]);
  }
  return { root: layers[depth][0], layers };
}

// For a leaf at index `leafIdx` in a depth-`depth` tree, compute the Merkle
// path: an array of sibling hashes (bottom-up) and the per-level direction
// bits (0 = leaf is left child, 1 = right child). Padding rules mirror the
// circuit: missing siblings are the literal `0` field element.
function merklePath(layers, leafIdx, depth) {
  const pathElements = [];
  const pathIndices = [];
  let idx = leafIdx;
  for (let level = 0; level < depth; level++) {
    const siblingIdx = idx ^ 1;
    const layer = layers[level];
    const sibling = siblingIdx < layer.length ? layer[siblingIdx] : "0";
    pathElements.push(sibling);
    pathIndices.push((idx & 1).toString());
    idx >>= 1;
  }
  return { pathElements, pathIndices };
}

function writeExample(circuit, payload) {
  const out = resolve(CIRCUITS_DIR, circuit, "example_input.json");
  writeFileSync(out, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(`wrote ${out}`);
}

// ------------------------------------------------------------------
// 1. unique_human_nullifier (depth 16)
// ------------------------------------------------------------------
{
  const depth = 16;
  const secret = 1234567n;
  const appId = 99n;
  const leaf = pos(secret);
  // Build a tiny 4-leaf tree where ours is at index 2; pad up to depth 16.
  const leaves = [pos(11n), pos(22n), leaf, pos(44n)];
  const { root, layers } = buildMerkleTree(leaves, depth);
  const { pathElements, pathIndices } = merklePath(layers, 2, depth);
  writeExample("unique_human_nullifier", {
    secret: secret.toString(),
    pathElements,
    pathIndices,
    humansRoot: root,
    appId: appId.toString(),
  });
}

// ------------------------------------------------------------------
// 2. country_allowlist (depth 8)
// ------------------------------------------------------------------
{
  const depth = 8;
  const countryCode = 840n; // ISO numeric for United States
  const salt = 31337n;
  const commitment = pos(countryCode, salt);
  const leaf = pos(countryCode);
  // Allowed: US (840), CA (124), GB (826), DE (276). Ours at index 0.
  const leaves = [leaf, pos(124n), pos(826n), pos(276n)];
  const { root, layers } = buildMerkleTree(leaves, depth);
  const { pathElements, pathIndices } = merklePath(layers, 0, depth);
  writeExample("country_allowlist", {
    countryCode: countryCode.toString(),
    salt: salt.toString(),
    pathElements,
    pathIndices,
    commitment,
    allowlistRoot: root,
  });
}

// ------------------------------------------------------------------
// 3. eddsa_credential_check
// ------------------------------------------------------------------
{
  // Deterministic issuer key derived from a fixed seed for reproducibility.
  const issuerPrv = Buffer.from(
    "0001020304050607080910111213141516171819202122232425262728293031",
    "hex",
  );
  const issuerPub = eddsa.prv2pub(issuerPrv);
  const subject = 4242n;
  const claim = pos(7n); // e.g. claim id "isAdult"
  const msg = poseidon([subject, claim]);
  const sig = eddsa.signPoseidon(issuerPrv, msg);
  const contextId = 12345n;
  writeExample("eddsa_credential_check", {
    subject: subject.toString(),
    claim,
    issuerAx: fs(issuerPub[0]),
    issuerAy: fs(issuerPub[1]),
    sigS: sig.S.toString(),
    sigR8x: fs(sig.R8[0]),
    sigR8y: fs(sig.R8[1]),
    contextId: contextId.toString(),
  });
}

// ------------------------------------------------------------------
// 4. solvency_attestation (N = 16)
// ------------------------------------------------------------------
{
  const N = 16;
  const balances = [];
  const salts = [];
  const commitments = [];
  let total = 0n;
  for (let i = 0; i < N; i++) {
    const b = BigInt(100_000 + i * 7);
    const s = BigInt(1000 + i);
    balances.push(b.toString());
    salts.push(s.toString());
    commitments.push(pos(b, s));
    total += b;
  }
  const threshold = (total - 1000n).toString();
  writeExample("solvency_attestation", {
    balances,
    salts,
    commitments,
    threshold,
  });
}

// ------------------------------------------------------------------
// 5. private_transfer (depth 16)
// ------------------------------------------------------------------
{
  const depth = 16;
  const secret = 9876543n;
  const nullifierSeed = 555n;
  const recipient = 0xc0ffeeBn; // any field element fits
  const leaf = pos(secret, nullifierSeed);
  const leaves = [pos(11n), leaf, pos(33n), pos(44n)];
  const { root, layers } = buildMerkleTree(leaves, depth);
  const { pathElements, pathIndices } = merklePath(layers, 1, depth);
  writeExample("private_transfer", {
    secret: secret.toString(),
    nullifierSeed: nullifierSeed.toString(),
    pathElements,
    pathIndices,
    root,
    recipient: recipient.toString(),
  });
}

// ------------------------------------------------------------------
// 6. hidden_bid_validity
// ------------------------------------------------------------------
{
  const bid = 5_000n;
  const salt = 24680n;
  const minBid = 1_000n;
  const maxBid = 10_000n;
  writeExample("hidden_bid_validity", {
    bid: bid.toString(),
    salt: salt.toString(),
    commitment: pos(bid, salt),
    minBid: minBid.toString(),
    maxBid: maxBid.toString(),
  });
}

// ------------------------------------------------------------------
// 7. sha256_preimage_short
// ------------------------------------------------------------------
{
  // 32-byte preimage = ASCII "0gzk-mainnet-canary-bytes-v0.1.0"; pad/trim to 32.
  let preimage = Buffer.from("0gzk-mainnet-canary-bytes-v0.1.0", "utf8");
  if (preimage.length !== 32) {
    const padded = Buffer.alloc(32, 0);
    preimage.copy(padded, 0, 0, Math.min(preimage.length, 32));
    preimage = padded;
  }
  const digest = createHash("sha256").update(preimage).digest();
  const toHex = (buf) => `0x${buf.toString("hex")}`;
  const preimageHigh = BigInt(toHex(preimage.subarray(0, 16))).toString();
  const preimageLow = BigInt(toHex(preimage.subarray(16, 32))).toString();
  const hashHigh = BigInt(toHex(digest.subarray(0, 16))).toString();
  const hashLow = BigInt(toHex(digest.subarray(16, 32))).toString();
  writeExample("sha256_preimage_short", {
    preimageHigh,
    preimageLow,
    hashHigh,
    hashLow,
  });
}

// ------------------------------------------------------------------
// 8. range_proof_64bit
// ------------------------------------------------------------------
{
  const x = 1_000_000n;
  const salt = 13579n;
  writeExample("range_proof_64bit", {
    x: x.toString(),
    salt: salt.toString(),
    commitment: pos(x, salt),
  });
}

// ------------------------------------------------------------------
// 9. anonymous_vote (depth 16, K = 8)
// ------------------------------------------------------------------
{
  const depth = 16;
  const voterSecret = 700700n;
  const ballotId = 20260520n;
  const vote = 3n;
  const leaf = pos(voterSecret);
  const leaves = [pos(11n), pos(22n), pos(33n), leaf];
  const { root, layers } = buildMerkleTree(leaves, depth);
  const { pathElements, pathIndices } = merklePath(layers, 3, depth);
  writeExample("anonymous_vote", {
    voterSecret: voterSecret.toString(),
    pathElements,
    pathIndices,
    vote: vote.toString(),
    votersRoot: root,
    ballotId: ballotId.toString(),
  });
}

// ------------------------------------------------------------------
// 10. geofence_proof
// ------------------------------------------------------------------
{
  // Encoded as round((deg + offset) * 1e6).
  // San Francisco (37.7749, -122.4194) inside a box that loosely bounds the
  // SF Bay Area: lat 37.0..38.5, lng -123.0..-121.5.
  const enc = (deg, offset) => Math.round((deg + offset) * 1_000_000);
  writeExample("geofence_proof", {
    lat: enc(37.7749, 90).toString(),
    lng: enc(-122.4194, 180).toString(),
    latMin: enc(37.0, 90).toString(),
    latMax: enc(38.5, 90).toString(),
    lngMin: enc(-123.0, 180).toString(),
    lngMax: enc(-121.5, 180).toString(),
  });
}

console.log("\nDone. 10 example_input.json files written.");
