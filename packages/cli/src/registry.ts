import * as path from "node:path";
import { promises as fs } from "node:fs";

import {
  fetchBundle,
  loadConfig,
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
import type { BundleFiles } from "@0gzk/sdk";
import { ethers } from "ethers";

export interface RegistryConnectOptions {
  network?: "testnet" | "mainnet";
  rpcUrl?: string;
  registryAddress?: string;
  privateKey?: string;
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
    network: opts.network,
    rpcUrl: opts.rpcUrl,
    privateKey: opts.privateKey,
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
 * Canonicalise a verification_key.json object and hash it. We use stable JSON
 * stringification (sorted keys, no whitespace) so two parties computing this
 * over the same vkey get identical bytes32. The on-chain registry stores this
 * digest so consumers can prove the bundle they fetched matches the one that
 * was registered.
 */
export function hashVkey(vkey: unknown): string {
  const canonical = canonicalJSON(vkey);
  return ethers.keccak256(ethers.toUtf8Bytes(canonical));
}

function canonicalJSON(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(",")}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  const body = keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJSON((value as Record<string, unknown>)[k])}`)
    .join(",");
  return `{${body}}`;
}

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

/**
 * Fetch a bundle by name@version: looks up the rootHash on-chain and then
 * downloads + extracts via @0gzk/sdk/node's `fetchBundle`. Caches under
 * `cacheDir/<rootHash>/`.
 */
export async function fetchBundleByName(
  handle: RegistryHandle,
  spec: { name: string; version?: string },
  cacheDir?: string,
): Promise<{ bundle: BundleFiles; rootHash: string; version: string; record: VersionRecord }> {
  const { version, record } = await resolveVersionRecord(handle, spec);

  if (cacheDir) {
    const cacheTarget = path.join(cacheDir, record.rootHash.toLowerCase());
    if (await pathExists(path.join(cacheTarget, "metadata.json"))) {
      const bundle = await readBundleFromDir(cacheTarget);
      return { bundle, rootHash: record.rootHash, version, record };
    }
    await fs.mkdir(cacheTarget, { recursive: true });
    const bundle = await fetchBundle(record.rootHash, handle.config, cacheTarget);
    return { bundle, rootHash: record.rootHash, version, record };
  }

  const bundle = await fetchBundle(record.rootHash, handle.config);
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
