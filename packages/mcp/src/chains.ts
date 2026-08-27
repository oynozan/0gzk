/**
 * The ONLY chain-aware module. Everything the tools need to talk to a live
 * registry or fetch a published bundle goes through here.
 */
import { NETWORKS, parseBundleRef, resolveNetwork } from "@0gzk/sdk";
import type { BundleFiles } from "@0gzk/sdk";
import { fetchBundle, loadConfig } from "@0gzk/sdk/node";
import { getRegistryAddress, getRegistryContract } from "@0gzk/sdk/onchain";
import { JsonRpcProvider, type Contract } from "ethers";

export const CHAIN_SLUGS = ["0g-mainnet", "0g-testnet", "base", "base-sepolia"] as const;
export type ChainSlug = (typeof CHAIN_SLUGS)[number];

const REGISTRY_ENV: Partial<Record<ChainSlug, string>> = {
  base: "OGZK_REGISTRY_ADDRESS_BASE",
  "base-sepolia": "OGZK_REGISTRY_ADDRESS_BASE_SEPOLIA",
};

export interface ChainInfo {
  slug: ChainSlug;
  chainId: number;
  rpcUrl: string;
  registryAddress: string | null;
}

function envSelectedNetwork(): string | undefined {
  return resolveNetwork(process.env.OGZK_NETWORK ?? process.env.OG_NETWORK);
}

export function getChainInfo(slug: ChainSlug): ChainInfo {
  const preset = NETWORKS[slug];
  // OG_RPC_URL only overrides the network the env actually selects — it must
  // not silently redirect every chain's RPC.
  const rpcUrl =
    process.env.OG_RPC_URL && envSelectedNetwork() === slug ? process.env.OG_RPC_URL : preset.rpcUrl;
  let registryAddress: string | null = getRegistryAddress(preset.chainId);
  if (!registryAddress) {
    const envName = REGISTRY_ENV[slug];
    const fromEnv = envName ? process.env[envName] : undefined;
    registryAddress = fromEnv && fromEnv.length > 0 ? fromEnv : null;
  }
  return { slug, chainId: preset.chainId, rpcUrl, registryAddress };
}

/** Read-only registry contract for a chain. Throws when no address is known. */
export function getRegistry(slug: ChainSlug): Contract {
  const info = getChainInfo(slug);
  if (!info.registryAddress) {
    const envName = REGISTRY_ENV[slug];
    throw new Error(
      `No CircuitRegistry address known for ${slug} (chainId ${info.chainId}).` +
        (envName ? ` Set the ${envName} environment variable to supply one.` : ""),
    );
  }
  const provider = new JsonRpcProvider(info.rpcUrl, info.chainId, { staticNetwork: true });
  return getRegistryContract(provider, info.registryAddress, info.chainId);
}

/**
 * Fetch and extract the bundle a registry record points at into `destDir`.
 * Routes to IPFS or 0G Storage via the record's `metadataURI` convention.
 */
export async function fetchBundleForRecord(
  record: { rootHash: string; metadataURI: string },
  slug: ChainSlug,
  destDir: string,
): Promise<BundleFiles> {
  const bundleRef = parseBundleRef(record);
  const ref = bundleRef.backend === "ipfs" ? `ipfs://${bundleRef.ref}` : record.rootHash;
  const config = loadConfig({ network: slug });
  return fetchBundle(ref, config, destDir);
}

/** Race a promise against a timeout; the loser's rejection is discarded. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      },
    );
  });
}
