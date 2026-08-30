import {
  NETWORKS,
  NETWORK_NAMES,
  resolveNetwork,
  type Network,
} from "../networks.js";
import type { StorageBackendId } from "../bundle-ref.js";

export { NETWORKS, NETWORK_ALIASES, NETWORK_NAMES, resolveNetwork } from "../networks.js";
export type { Network, NetworkPreset } from "../networks.js";

/** 0G-family networks — the only chains the 0G Storage backend can sign on. */
export type ZeroGNetwork = Extract<Network, "0g-mainnet" | "0g-testnet">;

export interface IpfsConfig {
  /** pinFileToIPFS-compatible upload endpoint (any Pinata-style service). */
  apiUrl: string;
  /** Bearer token for the upload endpoint. Only needed to publish. */
  apiToken?: string;
  /** Public HTTP gateway used for fetches. */
  gateway: string;
}

const DEFAULT_IPFS_API_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const DEFAULT_IPFS_GATEWAY = "https://gateway.pinata.cloud";

/**
 * Resolved runtime config. The name predates multi-chain support: it carries
 * both the registry-chain settings (network/chainId/rpcUrl/explorer) and the
 * storage-backend settings (storage/storageNetwork/indexerUrl/ipfs).
 */
export interface StorageConfig {
  network: Network;
  chainId: number;
  /** Registry-chain RPC. */
  rpcUrl: string;
  explorer: string;
  /** 0G Storage indexer (used only when `storage` is `"0g"`). */
  indexerUrl: string;
  privateKey?: string;
  /** Which backend holds bundle tarballs. */
  storage: StorageBackendId;
  /** Which 0G chain the 0G Storage backend signs uploads against. */
  storageNetwork: ZeroGNetwork;
  ipfs: IpfsConfig;
}

function resolveNetworkOrThrow(value: string, source: string): Network {
  const resolved = resolveNetwork(value);
  if (!resolved) {
    throw new Error(
      `Unknown network "${value}" (from ${source}). ` +
        `Valid values: ${NETWORK_NAMES.join(", ")} ` +
        `(plus deprecated aliases mainnet, testnet).`,
    );
  }
  return resolved;
}

function isBackend(value: string | undefined): value is StorageBackendId {
  return value === "0g" || value === "ipfs";
}

/**
 * Resolution order per field: explicit override → generic OGZK_* env →
 * legacy OG_* env → network preset → built-in default.
 *
 * Storage defaults by family: 0G chains keep `storage: "0g"`; other chains
 * default to `"ipfs"` so e.g. Base users never need a 0G wallet.
 */
export function loadConfig(overrides: Partial<StorageConfig> = {}): StorageConfig {
  const env = process.env;

  const networkInput = overrides.network ?? env.OGZK_NETWORK ?? env.OG_NETWORK;
  const network: Network =
    networkInput === undefined
      ? "0g-mainnet"
      : resolveNetworkOrThrow(
          networkInput,
          overrides.network
            ? "the network option"
            : env.OGZK_NETWORK
              ? "OGZK_NETWORK"
              : "OG_NETWORK",
        );
  const preset = NETWORKS[network];

  const envStorage = env.OGZK_STORAGE;
  const storage: StorageBackendId =
    overrides.storage ??
    (isBackend(envStorage) ? envStorage : preset.family === "0g" ? "0g" : "ipfs");

  const storageNetworkInput =
    overrides.storageNetwork ?? env.OGZK_STORAGE_NETWORK ?? undefined;
  let storageNetwork: ZeroGNetwork;
  if (storageNetworkInput !== undefined) {
    const resolved = resolveNetworkOrThrow(storageNetworkInput, "storageNetwork");
    if (NETWORKS[resolved].family !== "0g") {
      throw new Error(
        `storageNetwork must be a 0G chain (0g-mainnet or 0g-testnet), got "${storageNetworkInput}".`,
      );
    }
    storageNetwork = resolved as ZeroGNetwork;
  } else {
    storageNetwork = preset.family === "0g" ? (network as ZeroGNetwork) : "0g-mainnet";
  }

  return {
    network,
    chainId: overrides.chainId ?? preset.chainId,
    rpcUrl: overrides.rpcUrl ?? env.OGZK_RPC_URL ?? env.OG_RPC_URL ?? preset.rpcUrl,
    explorer: overrides.explorer ?? preset.explorer,
    indexerUrl:
      overrides.indexerUrl ??
      env.OG_INDEXER_URL ??
      // indexerUrl is non-optional for backcompat; resolve it from the chain
      // the 0G backend would sign on, even when storage is "ipfs".
      NETWORKS[storageNetwork].indexerUrl!,
    privateKey: overrides.privateKey ?? env.OGZK_PRIVATE_KEY ?? env.OG_PRIVATE_KEY,
    storage,
    storageNetwork,
    ipfs: {
      apiUrl: overrides.ipfs?.apiUrl ?? env.OGZK_IPFS_API_URL ?? DEFAULT_IPFS_API_URL,
      apiToken: overrides.ipfs?.apiToken ?? env.OGZK_IPFS_API_TOKEN,
      gateway: overrides.ipfs?.gateway ?? env.OGZK_IPFS_GATEWAY ?? DEFAULT_IPFS_GATEWAY,
    },
  };
}

export function requireSigningConfig(config: StorageConfig): asserts config is StorageConfig & {
  privateKey: string;
} {
  if (!config.privateKey) {
    throw new Error(
      "Missing private key. Set OGZK_PRIVATE_KEY (or legacy OG_PRIVATE_KEY) in " +
        "your environment before uploading or registering.",
    );
  }
}
