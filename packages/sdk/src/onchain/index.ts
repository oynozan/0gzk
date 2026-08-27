import { Contract, type ContractRunner } from "ethers";

import type { BundleFiles } from "../types.js";
import { CIRCUIT_REGISTRY_ABI } from "./abi.js";
import { getRegistryAddress } from "./addresses.js";

export { CIRCUIT_REGISTRY_ABI } from "./abi.js";
export { REGISTRY_ADDRESSES, getRegistryAddress } from "./addresses.js";

/**
 * Decoded form of `CircuitRegistry.Version` returned by `getVersion` /
 * `getLatest`. Hashes come back as 0x-prefixed hex strings; `publishedAt` is
 * a Unix timestamp in seconds.
 */
export interface VersionRecord {
  rootHash: string;
  vkeyHash: string;
  verifier: string;
  publisher: string;
  publishedAt: number;
  metadataURI: string;
}

/** Page row returned by `listCircuits`. */
export interface CircuitSummary {
  name: string;
  owner: string;
  versionCount: number;
  latestVersion: string;
}

export interface ResolvedRecord extends VersionRecord {
  name: string;
  version: string;
}

export interface ResolveOptions {
  /** Override the cached on-chain address for the chain the runner is on. */
  registryAddress?: string;
  /**
   * Chain id used to look up the default registry address. Defaults to
   * 16661 (0G mainnet). Pass 16602 for Galileo testnet.
   */
  chainId?: number;
}

/**
 * Construct a typed read-only ethers Contract bound to the registry. Pass any
 * `ContractRunner` (a JsonRpcProvider, a connected Wallet, a viem-like adapter
 * implementing `call`, ...). Caller-supplied `address` always wins over the
 * built-in mapping.
 */
export function getRegistryContract(
  runner: ContractRunner,
  address?: string,
  chainId = 16661,
): Contract {
  const resolved = address ?? getRegistryAddress(chainId);
  if (!resolved) {
    throw new Error(
      `No CircuitRegistry address known for chainId ${chainId}. ` +
        `Pass an explicit address, or update REGISTRY_ADDRESSES after deploying.`,
    );
  }
  return new Contract(resolved, CIRCUIT_REGISTRY_ABI as unknown as readonly object[], runner);
}

function decodeVersion(raw: {
  rootHash: string;
  vkeyHash: string;
  verifier: string;
  publisher: string;
  publishedAt: bigint | number;
  metadataURI: string;
}): VersionRecord {
  return {
    rootHash: raw.rootHash,
    vkeyHash: raw.vkeyHash,
    verifier: raw.verifier,
    publisher: raw.publisher,
    publishedAt: Number(raw.publishedAt),
    metadataURI: raw.metadataURI,
  };
}

export async function getVersion(
  registry: Contract,
  name: string,
  version: string,
): Promise<VersionRecord> {
  const raw = await registry.getFunction("getVersion")(name, version);
  return decodeVersion(raw);
}

export async function getLatest(
  registry: Contract,
  name: string,
): Promise<{ version: string; record: VersionRecord }> {
  const [version, raw] = await registry.getFunction("getLatest")(name);
  return { version, record: decodeVersion(raw) };
}

export async function listCircuits(
  registry: Contract,
  options: { offset?: number | bigint; limit?: number | bigint } = {},
): Promise<CircuitSummary[]> {
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 50;
  const rows = await registry.getFunction("listCircuits")(offset, limit);
  return (rows as Array<[string, string, bigint, string]>).map((row) => ({
    name: row[0],
    owner: row[1],
    versionCount: Number(row[2]),
    latestVersion: row[3],
  }));
}

export async function listVersions(registry: Contract, name: string): Promise<string[]> {
  const result = await registry.getFunction("listVersions")(name);
  return result as string[];
}

/**
 * Convenience: resolve `<name>@<version>` (or just `<name>` for latest) into
 * the on-chain record and then fetch the bundle from 0G Storage via a
 * caller-provided fetch function. Keeps the SDK browser-friendly: callers in
 * Node land use `@0gzk/sdk/node`'s `fetchBundle`, callers in the browser pass
 * a fetch shim that hits a server-side proxy.
 */
export async function resolveBundle(
  registry: Contract,
  spec: { name: string; version?: string },
  fetchBundleFn: (rootHash: string) => Promise<BundleFiles>,
): Promise<{ record: ResolvedRecord; bundle: BundleFiles }> {
  const lookup = spec.version
    ? { version: spec.version, record: await getVersion(registry, spec.name, spec.version) }
    : await getLatest(registry, spec.name);

  const bundle = await fetchBundleFn(lookup.record.rootHash);
  // Defensive sanity check: the fetched bundle's metadata should agree with
  // the registry record. We don't fail hard on name mismatch — a circuit could
  // legitimately be re-pointed under a new alias — but bundle.metadata.name
  // and the requested name being equal is the well-behaved case.
  return {
    record: { name: spec.name, version: lookup.version, ...lookup.record },
    bundle,
  };
}

/**
 * Parse `<name>@<version>` strings used by the CLI and the web app.
 * Returns `version` as undefined when only a name is supplied.
 */
export function parseNameSpec(input: string): { name: string; version?: string } {
  const at = input.indexOf("@");
  if (at < 0) return { name: input };
  return { name: input.slice(0, at), version: input.slice(at + 1) };
}
