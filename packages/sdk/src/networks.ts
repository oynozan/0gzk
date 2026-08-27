/**
 * Chain presets shared by every 0gzk surface (SDK, CLI, web, examples).
 * Isomorphic: pure data + string helpers, no Node imports.
 *
 * Adding a chain is data, not types: add one entry to `NETWORKS` and the
 * `Network` union, `resolveNetwork`, and `networkForChainId` pick it up.
 */

export interface NetworkPreset {
  chainId: number;
  /**
   * `"0g"` chains carry native 0G Storage (an `indexerUrl` is required);
   * `"evm"` chains are plain EVM networks with no native bundle storage.
   */
  family: "0g" | "evm";
  rpcUrl: string;
  /** Explorer base URL, e.g. `https://basescan.org`. */
  explorer: string;
  /** Path template for transaction links. Default: `/tx/{hash}`. */
  explorerTxPath?: string;
  /** Path template for address links. Default: `/address/{address}`. */
  explorerAddressPath?: string;
  /** 0G Storage indexer endpoint. Only present on `family: "0g"` chains. */
  indexerUrl?: string;
}

export const NETWORKS = {
  "0g-mainnet": {
    chainId: 16661,
    family: "0g",
    rpcUrl: "https://evmrpc.0g.ai",
    explorer: "https://chainscan.0g.ai",
    indexerUrl: "https://indexer-storage-turbo.0g.ai",
  },
  "0g-testnet": {
    chainId: 16602,
    family: "0g",
    rpcUrl: "https://evmrpc-testnet.0g.ai",
    explorer: "https://chainscan-galileo.0g.ai",
    indexerUrl: "https://indexer-storage-testnet-turbo.0g.ai",
  },
  base: {
    chainId: 8453,
    family: "evm",
    rpcUrl: "https://mainnet.base.org",
    explorer: "https://basescan.org",
  },
  "base-sepolia": {
    chainId: 84532,
    family: "evm",
    rpcUrl: "https://sepolia.base.org",
    explorer: "https://sepolia.basescan.org",
  },
} as const satisfies Record<string, NetworkPreset>;

export type Network = keyof typeof NETWORKS;

/** Deprecated single-word names still accepted everywhere a network is read. */
export const NETWORK_ALIASES: Record<string, Network> = {
  mainnet: "0g-mainnet",
  testnet: "0g-testnet",
};

export const NETWORK_NAMES = Object.keys(NETWORKS) as Network[];

/**
 * Resolve a canonical network name or a deprecated alias. Returns undefined
 * for unknown values so callers choose between defaulting and throwing.
 */
export function resolveNetwork(name: string | undefined | null): Network | undefined {
  if (!name) return undefined;
  if (name in NETWORKS) return name as Network;
  return NETWORK_ALIASES[name];
}

export function networkForChainId(chainId: number): Network | undefined {
  return NETWORK_NAMES.find((n) => NETWORKS[n].chainId === chainId);
}

export function explorerTxUrl(
  preset: Pick<NetworkPreset, "explorer" | "explorerTxPath">,
  txHash: string,
): string {
  const path = preset.explorerTxPath ?? "/tx/{hash}";
  return preset.explorer + path.replace("{hash}", txHash);
}

export function explorerAddressUrl(
  preset: Pick<NetworkPreset, "explorer" | "explorerAddressPath">,
  address: string,
): string {
  const path = preset.explorerAddressPath ?? "/address/{address}";
  return preset.explorer + path.replace("{address}", address);
}
