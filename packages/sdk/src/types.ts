export type InputVisibility = "public" | "private";

export interface InputSpec {
  /**
   * Logical type of the input. Recognised values:
   *   - "uint"    — non-negative integer scalar
   *   - "bool"    — boolean scalar (true/false/0/1)
   *   - "field"   — bn128 scalar field element (decimal/hex string, number, or bigint)
   *   - "<T>[]"   — array of any of the above (e.g. "uint[]", "field[]")
   * Unknown types fall through unchanged for forward compatibility.
   */
  type: string;
  visibility: InputVisibility;
  description?: string;
  /**
   * Optional fixed length for array types. Required for circuits with
   * fixed-size signal arrays (e.g. Merkle pathElements[8]).
   */
  length?: number;
}

export interface OutputSpec {
  type: string;
  description?: string;
}

export interface CircuitMetadata {
  name: string;
  version: string;
  description?: string;
  /** Free-form discovery tags, e.g. ["identity", "age", "comparison"]. */
  tags?: string[];
  /** Extra search keywords not natural in the description ("kyc", "over-18"). */
  keywords?: string[];
  /** One-line scenarios: "Gate an 18+ product without collecting DOB". */
  useCases?: string[];
  protocol: "groth16" | "plonk" | "fflonk";
  curve: "bn128" | "bls12-381";
  inputs: Record<string, InputSpec>;
  outputs: Record<string, OutputSpec>;
  files: {
    wasm: string;
    zkey: string;
    vkey: string;
    verifier?: string;
  };
}

export interface BundleFiles {
  wasm: Uint8Array;
  zkey: Uint8Array;
  vkey: unknown;
  metadata: CircuitMetadata;
  verifier?: string;
}
