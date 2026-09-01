import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { CircuitMetadata } from "../types.js";
import { assembleBundle, type AssembleBundleResult } from "./assemble.js";
import { fetchPowersOfTau } from "./ptau.js";
import { setupGroth16 } from "./setup.js";

export type {
  AssembleBundleOptions,
  AssembleBundleResult,
  BundleFileMap,
} from "./assemble.js";
export { assembleBundle } from "./assemble.js";

export type { FetchPtauOptions } from "./ptau.js";
export {
  PTAU_BLAKE2B,
  PtauIntegrityError,
  blake2b512File,
  defaultPtauCacheDir,
  fetchPowersOfTau,
  ptauFileName,
  ptauUrl,
} from "./ptau.js";

export type { SetupGroth16Options, SetupGroth16Result } from "./setup.js";
export { setupGroth16 } from "./setup.js";

export { canonicalJSON, hashVkey } from "./vkey.js";

/**
 * `buildCircuitBundle` stages and progress callback.
 *
 * Mirrors the shape of `UploadProgress` from `@0gzk/sdk/node` so callers can
 * write one progress sink that handles both flows.
 */
export type BuildStage =
  | "fetching-ptau"
  | "setup"
  | "exporting-vkey"
  | "exporting-verifier"
  | "assembling"
  | "done";

export interface BuildProgress {
  stage: BuildStage;
  message: string;
}

export interface BuildCircuitBundleOptions {
  /** Path to the circom-emitted `<name>.r1cs` file. */
  r1csPath: string;
  /** Path to the circom-emitted `<name>.wasm` file (the witness generator). */
  wasmPath: string;
  /** Path to the `metadata.json` describing the circuit. */
  metadataPath: string;
  /** Where to write the assembled `circuit_bundle/` directory. */
  outputDir: string;
  /** Powers of Tau exponent (12 = 2^12 constraints, etc). See `PTAU_BLAKE2B` for known sizes. */
  ptauSize: number;
  /** Override the default OS cache dir (`~/.cache/0gzk/ptau` etc). */
  ptauCacheDir?: string;
  /** Label for the snarkjs contribution. Defaults to `0gzk-sdk-bootstrap`. */
  contributionName?: string;
  /** Hex entropy for the contribution. Defaults to 32 bytes from `crypto.randomBytes`. */
  entropy?: string;
  /**
   * Where to put intermediate artifacts (initial zkey, exported vkey,
   * verifier.sol). Defaults to a fresh temp dir that's cleaned up on
   * success. Pass an explicit dir for debugging.
   */
  workDir?: string;
  /** Optional progress sink — fires once per stage transition. */
  onProgress?: (event: BuildProgress) => void;
}

export interface BuildCircuitBundleResult extends AssembleBundleResult {
  metadata: CircuitMetadata;
  ptauPath: string;
}

function emit(
  cb: BuildCircuitBundleOptions["onProgress"],
  event: BuildProgress,
): void {
  if (!cb) return;
  try {
    cb(event);
  } catch {
    // Listener errors are swallowed so a buggy logger can't abort the build.
  }
}

/**
 * End-to-end phase-2 setup + bundle assembly. Given pre-compiled circom
 * artifacts (`.r1cs` + `.wasm`) and a `metadata.json`, produces a directory
 * containing `circuit.wasm`, `circuit_final.zkey`, `verification_key.json`,
 * `verifier.sol`, and `metadata.json` — exactly what `0gzk publish` expects.
 *
 * Equivalent to steps 2-6 of `examples/05-publish-your-own/build.sh`. Step 1
 * (compiling the .circom) stays a user concern because circom has no JS
 * bindings; the example's `build.mjs` does it via `child_process` directly
 * before calling this function.
 */
export async function buildCircuitBundle(
  options: BuildCircuitBundleOptions,
): Promise<BuildCircuitBundleResult> {
  const workDir =
    options.workDir ??
    (await fs.mkdtemp(path.join(os.tmpdir(), "0gzk-build-")));
  const ownsWorkDir = options.workDir === undefined;

  try {
    emit(options.onProgress, {
      stage: "fetching-ptau",
      message: `Resolving Powers of Tau (size ${options.ptauSize})`,
    });
    const ptauPath = await fetchPowersOfTau(options.ptauSize, {
      cacheDir: options.ptauCacheDir,
    });

    emit(options.onProgress, {
      stage: "setup",
      message: "Running Groth16 setup + contribution",
    });
    const setupResult = await setupGroth16({
      r1csPath: options.r1csPath,
      ptauPath,
      outDir: workDir,
      contributionName: options.contributionName,
      entropy: options.entropy,
    });

    emit(options.onProgress, {
      stage: "exporting-vkey",
      message: "Exported verification_key.json",
    });
    emit(options.onProgress, {
      stage: "exporting-verifier",
      message: "Exported verifier.sol",
    });

    emit(options.onProgress, {
      stage: "assembling",
      message: `Assembling bundle in ${options.outputDir}`,
    });
    const assembled = await assembleBundle({
      wasmPath: options.wasmPath,
      zkeyPath: setupResult.zkeyPath,
      vkeyPath: setupResult.vkeyPath,
      verifierSolPath: setupResult.verifierSolPath,
      metadataPath: options.metadataPath,
      outputDir: options.outputDir,
    });

    emit(options.onProgress, {
      stage: "done",
      message: `Bundle ready at ${assembled.bundleDir} (vkeyHash ${assembled.vkeyHash})`,
    });

    return { ...assembled, ptauPath };
  } finally {
    if (ownsWorkDir) {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
