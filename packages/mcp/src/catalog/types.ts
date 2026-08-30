/**
 * Catalog data model: the committed `circuits/index.json` shape plus zod
 * schemas to validate it wherever it is loaded.
 */
import { z } from "zod";
import type { CircuitMetadata, InputSpec, OutputSpec } from "@0gzk/sdk";
import { InputSpecSchema, OutputSpecSchema } from "./metadata-schema.js";

export {
  CircuitMetadataSchema,
  InputSpecSchema,
  OutputSpecSchema,
  metadataWarnings,
  CANONICAL_BUNDLE_FILES,
} from "./metadata-schema.js";
export type { DiscoveryMetadata } from "./metadata-schema.js";

/** One row of `circuits/publications.json` — an on-chain publication record. */
export interface PublicationRecord {
  chain: string;
  chainId: number;
  registry: string;
  version: string;
  rootHash: string;
  vkeyHash: string;
  /** Null when imported from a local receipt, which does not record them. */
  verifier: string | null;
  publisher: string | null;
  metadataURI: string | null;
  storage: string;
  storageTxSeq: number | null;
  registryTxHash: string | null;
  publishedAt: string;
}

export const PublicationRecordSchema = z.object({
  chain: z.string(),
  chainId: z.number().int(),
  registry: z.string(),
  version: z.string(),
  rootHash: z.string(),
  vkeyHash: z.string(),
  verifier: z.string().nullable(),
  publisher: z.string().nullable(),
  metadataURI: z.string().nullable(),
  storage: z.string(),
  storageTxSeq: z.number().int().nullable(),
  registryTxHash: z.string().nullable(),
  publishedAt: z.string(),
});

/** Constraint counts read from a compiled `.r1cs` header. */
export interface ConstraintInfo {
  count: number;
  nPubIn?: number;
  nPrvIn?: number;
  nPubOut?: number;
  source: "r1cs-header";
}

export const ConstraintInfoSchema = z.object({
  count: z.number().int().nonnegative(),
  nPubIn: z.number().int().nonnegative().optional(),
  nPrvIn: z.number().int().nonnegative().optional(),
  nPubOut: z.number().int().nonnegative().optional(),
  source: z.literal("r1cs-header"),
});

export interface CatalogEntry {
  name: string;
  version: string;
  description: string;
  tags: string[];
  keywords: string[];
  useCases: string[];
  protocol: CircuitMetadata["protocol"];
  curve: CircuitMetadata["curve"];
  /** Verbatim `metadata.json` input map (declaration order preserved). */
  inputs: Record<string, InputSpec>;
  outputs: Record<string, OutputSpec>;
  exampleInput: Record<string, unknown> | null;
  ptauSize: number | null;
  constraints: ConstraintInfo | null;
  publications: PublicationRecord[];
  /** Repo-relative circuit directory, e.g. `circuits/age_verification`. */
  dir: string;
}

export const CatalogEntrySchema = z.object({
  name: z.string().min(1),
  version: z.string(),
  description: z.string(),
  tags: z.array(z.string()),
  keywords: z.array(z.string()),
  useCases: z.array(z.string()),
  protocol: z.enum(["groth16", "plonk", "fflonk"]),
  curve: z.enum(["bn128", "bls12-381"]),
  inputs: z.record(z.string(), InputSpecSchema),
  outputs: z.record(z.string(), OutputSpecSchema),
  exampleInput: z.record(z.string(), z.unknown()).nullable(),
  ptauSize: z.number().int().nullable(),
  constraints: ConstraintInfoSchema.nullable(),
  publications: z.array(PublicationRecordSchema),
  dir: z.string(),
});

export interface Catalog {
  schemaVersion: 1;
  circuits: CatalogEntry[];
}

export const CatalogSchema = z.object({
  schemaVersion: z.literal(1),
  circuits: z.array(CatalogEntrySchema),
});
