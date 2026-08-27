import "server-only";
import { JsonRpcProvider } from "ethers";

import {
  getRegistryContract,
  getVersion as sdkGetVersion,
  listVersions as sdkListVersions,
  parseNameSpec,
  type CircuitSummary,
  type ResolvedRecord,
  type VersionRecord,
} from "@0gzk/sdk/onchain";

const DEFAULT_RPC = "https://evmrpc.0g.ai";
const DEFAULT_CHAIN_ID = 16661;

function rpcUrl(): string {
  return (
    process.env.OG_RPC_URL ??
    process.env.NEXT_PUBLIC_OG_RPC_URL ??
    DEFAULT_RPC
  );
}

function chainId(): number {
  const raw = process.env.OG_CHAIN_ID;
  if (!raw) return DEFAULT_CHAIN_ID;
  const n = Number(raw);
  return Number.isFinite(n) ? n : DEFAULT_CHAIN_ID;
}

function registryAddressOverride(): string | undefined {
  const a = process.env.OG_REGISTRY_ADDRESS;
  return a && a.length > 0 ? a : undefined;
}

function getProvider(): JsonRpcProvider {
  return new JsonRpcProvider(rpcUrl());
}

function getRegistry() {
  return getRegistryContract(getProvider(), registryAddressOverride(), chainId());
}

export async function listAllCircuits(
  options: { offset?: number; limit?: number } = {},
): Promise<CircuitSummary[]> {
  const registry = getRegistry();
  const offset = BigInt(options.offset ?? 0);
  const limit = BigInt(options.limit ?? 100);
  const rows = (await registry.getFunction("listCircuits")(offset, limit)) as Array<
    [string, string, bigint, string]
  >;
  return rows.map((row) => ({
    name: row[0],
    owner: row[1],
    versionCount: Number(row[2]),
    latestVersion: row[3],
  }));
}

export interface ResolvedNameSpec {
  name: string;
  version: string;
  rootHash: string;
  vkeyHash: string;
  verifier: string;
  publisher: string;
  publishedAt: number;
  metadataURI: string;
}

export async function resolveNameToRecord(
  spec: string,
): Promise<ResolvedNameSpec> {
  const parsed = parseNameSpec(spec);
  const registry = getRegistry();
  const lookup = parsed.version
    ? {
        version: parsed.version,
        record: await registry
          .getFunction("getVersion")(parsed.name, parsed.version)
          .then(decode),
      }
    : await registry
        .getFunction("getLatest")(parsed.name)
        .then((res: [string, RegistryRawVersion]) => ({
          version: res[0],
          record: decode(res[1]),
        }));

  return {
    name: parsed.name,
    version: lookup.version,
    ...lookup.record,
  };
}

interface RegistryRawVersion {
  rootHash: string;
  vkeyHash: string;
  verifier: string;
  publisher: string;
  publishedAt: bigint | number;
  metadataURI: string;
}

function decode(raw: RegistryRawVersion) {
  return {
    rootHash: raw.rootHash,
    vkeyHash: raw.vkeyHash,
    verifier: raw.verifier,
    publisher: raw.publisher,
    publishedAt: Number(raw.publishedAt),
    metadataURI: raw.metadataURI,
  };
}

export type { ResolvedRecord };

export const NAME_SPEC_RE = /^[a-z0-9_-]+(?:@[a-zA-Z0-9._-]+)?$/;

/**
 * Strict name (no `@version`) — what `/circuits/[name]` accepts as its slug.
 * Mirrors the on-chain contract's allowed character class.
 */
export const CIRCUIT_NAME_RE = /^[a-z0-9_-]+$/;

export interface CircuitDetail {
  name: string;
  owner: string;
  versions: Array<{ version: string; record: VersionRecord }>;
  latest: string;
}

/**
 * One-shot fetch of every version of a single circuit, with the publisher /
 * timestamps / hashes decoded. Returns `null` if the name is unknown on chain.
 *
 * Issues `1 + N` RPC calls (one `listVersions`, one `getVersion` per row).
 * Acceptable while circuits have <20 versions each; revisit if that grows.
 */
export async function getCircuitDetail(name: string): Promise<CircuitDetail | null> {
  if (!CIRCUIT_NAME_RE.test(name)) return null;
  const registry = getRegistry();

  const exists = (await registry.getFunction("exists")(name)) as boolean;
  if (!exists) return null;

  const [owner, versions] = await Promise.all([
    registry.getFunction("ownerOf")(name) as Promise<string>,
    sdkListVersions(registry, name),
  ]);
  if (versions.length === 0) {
    return { name, owner, versions: [], latest: "" };
  }
  const records = await Promise.all(
    versions.map(async (version) => ({
      version,
      record: await sdkGetVersion(registry, name, version),
    })),
  );
  return {
    name,
    owner,
    versions: records,
    latest: versions[versions.length - 1]!,
  };
}
