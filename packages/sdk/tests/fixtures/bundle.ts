import { promises as fs } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import type { BundleFiles, CircuitMetadata } from "../../src/types.js";

const here = path.dirname(fileURLToPath(import.meta.url));

export const FIXTURE_DIR = path.join(here, "age_verification");

let cached: BundleFiles | null = null;

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Returns true iff the prebuilt fixture (wasm + zkey + vkey + metadata) is on
 * disk. Tests that exercise the full prover pipeline call this and skip when
 * false, so contributors and CI don't have to install circom + run a 200 MB
 * Powers of Tau download just to run the unit suite.
 */
export async function fixtureAvailable(): Promise<boolean> {
  return (
    (await exists(path.join(FIXTURE_DIR, "metadata.json"))) &&
    (await exists(path.join(FIXTURE_DIR, "circuit.wasm"))) &&
    (await exists(path.join(FIXTURE_DIR, "circuit_final.zkey"))) &&
    (await exists(path.join(FIXTURE_DIR, "verification_key.json")))
  );
}

/**
 * Load the prebuilt age_verification bundle from disk. The fixture is small
 * (~60 KB) and committed to the repo so unit/integration tests don't need
 * network or a circom toolchain to run.
 */
export async function loadAgeVerificationBundle(): Promise<BundleFiles> {
  if (cached) return cached;

  const metadataRaw = await fs.readFile(path.join(FIXTURE_DIR, "metadata.json"), "utf8");
  const metadata = JSON.parse(metadataRaw) as CircuitMetadata;

  const wasmBuf = await fs.readFile(path.join(FIXTURE_DIR, metadata.files.wasm));
  const zkeyBuf = await fs.readFile(path.join(FIXTURE_DIR, metadata.files.zkey));
  const vkeyRaw = await fs.readFile(path.join(FIXTURE_DIR, metadata.files.vkey), "utf8");

  cached = {
    wasm: new Uint8Array(wasmBuf.buffer, wasmBuf.byteOffset, wasmBuf.byteLength),
    zkey: new Uint8Array(zkeyBuf.buffer, zkeyBuf.byteOffset, zkeyBuf.byteLength),
    vkey: JSON.parse(vkeyRaw) as unknown,
    metadata,
  };
  return cached;
}
