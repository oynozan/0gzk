declare module "snarkjs" {
  export interface Groth16Proof {
    pi_a: [string, string, string];
    pi_b: [[string, string], [string, string], [string, string]];
    pi_c: [string, string, string];
    protocol: "groth16";
    curve: string;
  }

  export type WasmInput =
    | string
    | Uint8Array
    | { type: "mem"; data: Uint8Array };

  export type ZkeyInput = WasmInput;

  export interface Groth16FullProveResult {
    proof: Groth16Proof;
    publicSignals: string[];
  }

  export const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasm: WasmInput,
      zkey: ZkeyInput,
      logger?: unknown,
    ): Promise<Groth16FullProveResult>;
    verify(
      vkey: unknown,
      publicSignals: string[],
      proof: Groth16Proof,
      logger?: unknown,
    ): Promise<boolean>;
  };

  /**
   * snarkjs trusted-setup helpers. All four take filesystem paths (not
   * buffers) — that's how the snarkjs CLI uses them under the hood.
   */
  export const zKey: {
    newZKey(
      r1csName: string,
      ptauName: string,
      zkeyName: string,
      logger?: unknown,
    ): Promise<unknown>;
    contribute(
      zkeyNameOld: string,
      zkeyNameNew: string,
      name: string,
      entropy: string,
      logger?: unknown,
    ): Promise<unknown>;
    exportVerificationKey(zkeyName: string, logger?: unknown): Promise<unknown>;
    exportSolidityVerifier(
      zkeyName: string,
      templates: { groth16?: string; plonk?: string; fflonk?: string },
      logger?: unknown,
    ): Promise<string>;
  };
}
