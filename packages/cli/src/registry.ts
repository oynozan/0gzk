import * as path from "node:path";
import { promises as fs } from "node:fs";

import {
  fetchBundle,
  loadConfig,
  parseBundleRef,
  readBundleFromDir,
  type StorageConfig,
} from "@0gzk/sdk/node";
import {
  getLatest,
  getRegistryAddress,
  getRegistryContract,
  getVersion,
  listCircuits as listCircuitsHelper,
  listVersions,
  parseNameSpec,
  type VersionRecord,
} from "@0gzk/sdk/onchain";
import { canonicalJSON, hashVkey as hashVkeyTyped } from "@0gzk/sdk/build";
import type { BundleFiles } from "@0gzk/sdk";
import { ethers } from "ethers";

export interface RegistryConnectOptions {
  network?: string;
  rpcUrl?: string;
  registryAddress?: string;
  privateKey?: string;
  storage?: string;
  storageNetwork?: string;
}

export interface RegistryHandle {
  config: StorageConfig;
  provider: ethers.JsonRpcProvider;
  signer?: ethers.Wallet;
  registry: ethers.Contract;
  registryAddress: string;
}

function resolveRegistryAddress(config: StorageConfig, override?: string): string {
  if (override) return override;
  const fromMap = getRegistryAddress(config.chainId);
  if (fromMap) return fromMap;
  throw new Error(
    `No CircuitRegistry address known for chainId ${config.chainId}. ` +
      `Pass --registry <0x...> or set OGZK_REGISTRY_ADDRESS in your environment.`,
  );
}

/** Open a read- or write-capable connection to the registry. */
export function connectRegistry(opts: RegistryConnectOptions = {}): RegistryHandle {
  const config = loadConfig({
    network: opts.network as StorageConfig["network"] | undefined,
    rpcUrl: opts.rpcUrl,
    privateKey: opts.privateKey,
    storage: opts.storage as StorageConfig["storage"] | undefined,
    storageNetwork: opts.storageNetwork as StorageConfig["storageNetwork"] | undefined,
  });
  const envOverride = process.env.OGZK_REGISTRY_ADDRESS;
  const registryAddress = resolveRegistryAddress(config, opts.registryAddress ?? envOverride);
  const provider = new ethers.JsonRpcProvider(config.rpcUrl);
  const signer = config.privateKey ? new ethers.Wallet(config.privateKey, provider) : undefined;
  const runner: ethers.ContractRunner = signer ?? provider;
  const registry = getRegistryContract(runner, registryAddress, config.chainId);
  return { config, provider, signer, registry, registryAddress };
}

export {
  getLatest,
  getVersion,
  listCircuitsHelper as listCircuits,
  listVersions,
  parseNameSpec,
};

/**
 * Canonical-JSON keccak256 of a verification key — re-exported from
 * `@0gzk/sdk/build` so the CLI and SDK can never drift.
 */
export function hashVkey(vkey: unknown): string {
  return hashVkeyTyped(vkey);
}

export { canonicalJSON };

/** Resolve a name@version (or just name) into a VersionRecord. */
export async function resolveVersionRecord(
  handle: RegistryHandle,
  spec: { name: string; version?: string },
): Promise<{ version: string; record: VersionRecord }> {
  if (spec.version) {
    const record = await getVersion(handle.registry, spec.name, spec.version);
    return { version: spec.version, record };
  }
  return getLatest(handle.registry, spec.name);
}

/** The record decides the backend: ipfs:// metadataURI → IPFS, else 0G. */
function bundleFetchRef(record: VersionRecord): string {
  const ref = parseBundleRef(record);
  return ref.backend === "ipfs" ? `ipfs://${ref.ref}` : record.rootHash;
}

function warnOnVkeyMismatch(record: VersionRecord, bundle: BundleFiles): void {
  const computed = hashVkeyTyped(bundle.vkey);
  if (computed.toLowerCase() !== record.vkeyHash.toLowerCase()) {
    process.stderr.write(
      `warn: fetched bundle's verification key hashes to ${computed}, but the ` +
        `registry record says ${record.vkeyHash}. The bundle may not be the one ` +
        "that was registered — verify before trusting proofs against it.\n",
    );
  }
}

/**
 * Fetch a bundle by name@version: looks up the record on-chain, routes to the
 * storage backend named by its metadataURI (0G Storage or IPFS), and extracts.
 * Caches under `cacheDir/<rootHash>/` — the cache key is the rootHash
 * regardless of backend.
 */
export async function fetchBundleByName(
  handle: RegistryHandle,
  spec: { name: string; version?: string },
  cacheDir?: string,
): Promise<{ bundle: BundleFiles; rootHash: string; version: string; record: VersionRecord }> {
  const { version, record } = await resolveVersionRecord(handle, spec);
  const fetchRef = bundleFetchRef(record);

  if (cacheDir) {
    const cacheTarget = path.join(cacheDir, record.rootHash.toLowerCase());
    if (await pathExists(path.join(cacheTarget, "metadata.json"))) {
      const bundle = await readBundleFromDir(cacheTarget);
      return { bundle, rootHash: record.rootHash, version, record };
    }
    await fs.mkdir(cacheTarget, { recursive: true });
    const bundle = await fetchBundle(fetchRef, handle.config, cacheTarget);
    warnOnVkeyMismatch(record, bundle);
    return { bundle, rootHash: record.rootHash, version, record };
  }

  const bundle = await fetchBundle(fetchRef, handle.config);
  warnOnVkeyMismatch(record, bundle);
  return { bundle, rootHash: record.rootHash, version, record };
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
