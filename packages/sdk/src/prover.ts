import { groth16, type Groth16Proof } from "snarkjs";

import { validateInputs } from "./inputs.js";
import type { BundleFiles } from "./types.js";

export interface ProofResult {
  proof: Groth16Proof;
  publicSignals: string[];
}

export async function generateProof(
  bundle: BundleFiles,
  inputs: Record<string, unknown>,
): Promise<ProofResult> {
  const validated = validateInputs(inputs, bundle.metadata);

  const { proof, publicSignals } = await groth16.fullProve(
    validated as Record<string, unknown>,
    { type: "mem", data: bundle.wasm },
    { type: "mem", data: bundle.zkey },
  );

  return { proof, publicSignals };
}

export async function verifyLocal(
  bundle: BundleFiles,
  result: ProofResult,
): Promise<boolean> {
  return groth16.verify(bundle.vkey, result.publicSignals, result.proof);
}
