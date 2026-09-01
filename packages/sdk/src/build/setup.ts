import { promises as fs } from "node:fs";
import { createRequire } from "node:module";
import * as path from "node:path";
import * as crypto from "node:crypto";

import { zKey } from "snarkjs";

/**
 * Phase-2 (circuit-specific) Groth16 setup wrappers.
 *
 * snarkjs ships these as filesystem-path APIs that mirror its CLI verbs
 * 1:1, so this module is intentionally a thin layer: pick filenames, call
 * snarkjs, return the paths. Power users can call snarkjs directly; this
 * exists so the average circuit author never has to learn the snarkjs JS
 * API surface.
 */

export interface SetupGroth16Options {
  r1csPath: string;
  ptauPath: string;
  /** Directory where intermediate + final artifacts will be written. */
  outDir: string;
  /** Label embedded in the contributed zkey (snarkjs `--name` flag). */
  contributionName?: string;
  /**
   * Hex-encoded entropy for the contribution. If omitted, 32 random bytes
   * are generated via `crypto.randomBytes`. Pass a fixed value only for
   * reproducible test fixtures — not for production circuits.
   */
  entropy?: string;
}

export interface SetupGroth16Result {
  zkeyPath: string;
  vkeyPath: string;
  verifierSolPath: string;
  vkey: unknown;
  verifierSol: string;
}

/**
 * Locate snarkjs's bundled Solidity verifier templates on disk so we can
 * pass them into `exportSolidityVerifier` without copying them into the SDK.
 *
 * `require.resolve('snarkjs')` lands on `<snarkjs>/build/main.cjs`; the
 * templates live two directories up under `templates/`.
 */
function snarkjsTemplatesDir(): string {
  const requireCJS = createRequire(import.meta.url);
  const entry = requireCJS.resolve("snarkjs");
  return path.resolve(path.dirname(entry), "..", "templates");
}

async function loadVerifierTemplates(): Promise<{ groth16: string }> {
  const dir = snarkjsTemplatesDir();
  const groth16 = await fs.readFile(
    path.join(dir, "verifier_groth16.sol.ejs"),
    "utf8",
  );
  return { groth16 };
}

/**
 * Run phase-2 Groth16 setup end-to-end:
 *   1. `zKey.newZKey` from r1cs + ptau           -> circuit_0000.zkey
 *   2. `zKey.contribute` with random entropy     -> circuit_final.zkey
 *   3. `zKey.exportVerificationKey`              -> verification_key.json
 *   4. `zKey.exportSolidityVerifier`             -> verifier.sol
 *
 * Output filenames match what `0gzk publish` expects, so the result can be
 * dropped into a bundle dir as-is.
 */
export async function setupGroth16(
  options: SetupGroth16Options,
): Promise<SetupGroth16Result> {
  await fs.mkdir(options.outDir, { recursive: true });

  const initialZkeyPath = path.join(options.outDir, "circuit_0000.zkey");
  const finalZkeyPath = path.join(options.outDir, "circuit_final.zkey");
  const vkeyPath = path.join(options.outDir, "verification_key.json");
  const verifierSolPath = path.join(options.outDir, "verifier.sol");

  await zKey.newZKey(options.r1csPath, options.ptauPath, initialZkeyPath);

  const entropy = options.entropy ?? crypto.randomBytes(32).toString("hex");
  const contributionName = options.contributionName ?? "0gzk-sdk-bootstrap";
  await zKey.contribute(initialZkeyPath, finalZkeyPath, contributionName, entropy);

  const vkey = await zKey.exportVerificationKey(finalZkeyPath);
  await fs.writeFile(vkeyPath, `${JSON.stringify(vkey, null, 2)}\n`, "utf8");

  const templates = await loadVerifierTemplates();
  const verifierSol = await zKey.exportSolidityVerifier(finalZkeyPath, templates);
  await fs.writeFile(verifierSolPath, verifierSol, "utf8");

  await fs.rm(initialZkeyPath, { force: true });

  return { zkeyPath: finalZkeyPath, vkeyPath, verifierSolPath, vkey, verifierSol };
}
