import { promises as fs } from "node:fs";
import * as path from "node:path";

import type { CircuitMetadata } from "../types.js";
import { hashVkey } from "./vkey.js";

/**
 * Lay out the four artifact files plus `metadata.json` in `outputDir` using
 * the filenames declared in `metadata.files`. Designed so the result is
 * 1:1 ready for `0gzk publish`.
 */

export interface AssembleBundleOptions {
  wasmPath: string;
  zkeyPath: string;
  vkeyPath: string;
  /**
   * Path to the Solidity verifier source. Optional because the
   * `CircuitMetadata.files.verifier` field is itself optional, but the four
   * reference circuits (and `0gzk publish`'s default expectations) all
   * include one, so most callers should pass it.
   */
  verifierSolPath?: string;
  metadataPath: string;
  outputDir: string;
}

export interface BundleFileMap {
  wasm: string;
  zkey: string;
  vkey: string;
  verifier?: string;
  metadata: string;
}

export interface AssembleBundleResult {
  bundleDir: string;
  files: BundleFileMap;
  metadata: CircuitMetadata;
  vkeyHash: `0x${string}`;
}

async function copyFile(src: string, dest: string): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

export async function assembleBundle(
  options: AssembleBundleOptions,
): Promise<AssembleBundleResult> {
  const metadataRaw = await fs.readFile(options.metadataPath, "utf8");
  const metadata = JSON.parse(metadataRaw) as CircuitMetadata;

  if (
    !metadata.files?.wasm ||
    !metadata.files?.zkey ||
    !metadata.files?.vkey
  ) {
    throw new Error(
      `metadata.json is missing required \`files\` entries (wasm, zkey, vkey). ` +
        `Read packages/sdk/src/types.ts for the expected shape.`,
    );
  }

  const bundleDir = path.resolve(options.outputDir);
  await fs.mkdir(bundleDir, { recursive: true });

  const wasmDest = path.join(bundleDir, metadata.files.wasm);
  const zkeyDest = path.join(bundleDir, metadata.files.zkey);
  const vkeyDest = path.join(bundleDir, metadata.files.vkey);
  const metadataDest = path.join(bundleDir, "metadata.json");

  await copyFile(options.wasmPath, wasmDest);
  await copyFile(options.zkeyPath, zkeyDest);
  await copyFile(options.vkeyPath, vkeyDest);
  await copyFile(options.metadataPath, metadataDest);

  let verifierDest: string | undefined;
  if (options.verifierSolPath && metadata.files.verifier) {
    verifierDest = path.join(bundleDir, metadata.files.verifier);
    await copyFile(options.verifierSolPath, verifierDest);
  }

  const vkeyJson = JSON.parse(await fs.readFile(vkeyDest, "utf8")) as unknown;
  const vkeyHash = hashVkey(vkeyJson);

  return {
    bundleDir,
    files: {
      wasm: wasmDest,
      zkey: zkeyDest,
      vkey: vkeyDest,
      verifier: verifierDest,
      metadata: metadataDest,
    },
    metadata,
    vkeyHash,
  };
}
