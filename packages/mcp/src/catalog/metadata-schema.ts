/**
 * Zod schemas for `metadata.json` files, plus warning-level checks that are
 * deliberately kept separate from hard validation: a metadata file without
 * tags is valid, just less discoverable.
 */
import { z } from "zod";
import type { CircuitMetadata } from "@0gzk/sdk";

export const InputSpecSchema = z.object({
  type: z.string().min(1),
  visibility: z.enum(["public", "private"]),
  description: z.string().optional(),
  length: z.number().int().positive().optional(),
});

export const OutputSpecSchema = z.object({
  type: z.string().min(1),
  description: z.string().optional(),
});

export const CircuitMetadataSchema = z.object({
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+/, "expected a semver version like 0.1.0"),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  useCases: z.array(z.string()).optional(),
  protocol: z.enum(["groth16", "plonk", "fflonk"]),
  curve: z.enum(["bn128", "bls12-381"]),
  inputs: z.record(z.string(), InputSpecSchema),
  outputs: z.record(z.string(), OutputSpecSchema),
  files: z.object({
    wasm: z.string().min(1),
    zkey: z.string().min(1),
    vkey: z.string().min(1),
    verifier: z.string().optional(),
  }),
});

/**
 * `CircuitMetadata` from `@0gzk/sdk` plus the optional discovery fields the
 * repo's metadata files carry (`tags`, `keywords`, `useCases`).
 */
export interface DiscoveryMetadata extends CircuitMetadata {
  tags?: string[];
  keywords?: string[];
  useCases?: string[];
}

/** Canonical bundle file names every published 0gzk bundle uses. */
export const CANONICAL_BUNDLE_FILES = {
  wasm: "circuit.wasm",
  zkey: "circuit_final.zkey",
  vkey: "verification_key.json",
  verifier: "verifier.sol",
} as const;

/**
 * Warning-level checks. These never make a metadata file invalid — they flag
 * discoverability gaps and drift from the canonical bundle file names.
 */
export function metadataWarnings(metadata: DiscoveryMetadata): string[] {
  const warnings: string[] = [];
  if (!metadata.description) {
    warnings.push("missing description — discovery tools rank described circuits higher");
  }
  if (!metadata.tags || metadata.tags.length === 0) {
    warnings.push("missing tags — add a few (e.g. \"identity\", \"merkle\") so search_circuits can find this circuit");
  }
  if (!metadata.useCases || metadata.useCases.length === 0) {
    warnings.push("missing useCases — one-line scenarios help agents pick the right circuit");
  }
  for (const key of ["wasm", "zkey", "vkey", "verifier"] as const) {
    const actual = metadata.files[key];
    const canonical = CANONICAL_BUNDLE_FILES[key];
    if (actual !== undefined && actual !== canonical) {
      warnings.push(`files.${key} is "${actual}" — the canonical bundle name is "${canonical}"`);
    }
  }
  return warnings;
}
