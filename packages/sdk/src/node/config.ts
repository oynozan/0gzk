export type Network = "testnet" | "mainnet";

export interface NetworkPreset {
  rpcUrl: string;
  indexerUrl: string;
  chainId: number;
  explorer: string;
}

export const NETWORKS: Record<Network, NetworkPreset> = {
  testnet: {
    rpcUrl: "https://evmrpc-testnet.0g.ai",
    indexerUrl: "https://indexer-storage-testnet-turbo.0g.ai",
    chainId: 16602,
    explorer: "https://chainscan-galileo.0g.ai",
  },
  mainnet: {
    rpcUrl: "https://evmrpc.0g.ai",
    indexerUrl: "https://indexer-storage-turbo.0g.ai",
    chainId: 16661,
    explorer: "https://chainscan.0g.ai",
  },
};

export interface StorageConfig {
  network: Network;
  rpcUrl: string;
  indexerUrl: string;
  chainId: number;
  explorer: string;
  privateKey?: string;
}

function isNetwork(value: string | undefined): value is Network {
  return value === "testnet" || value === "mainnet";
}

export function loadConfig(overrides: Partial<StorageConfig> = {}): StorageConfig {
  const envNetwork = process.env.OG_NETWORK;
  const network: Network =
    overrides.network ?? (isNetwork(envNetwork) ? envNetwork : "mainnet");
  const preset = NETWORKS[network];

  return {
    network,
    rpcUrl: overrides.rpcUrl ?? process.env.OG_RPC_URL ?? preset.rpcUrl,
    indexerUrl:
      overrides.indexerUrl ?? process.env.OG_INDEXER_URL ?? preset.indexerUrl,
    chainId: overrides.chainId ?? preset.chainId,
    explorer: overrides.explorer ?? preset.explorer,
    privateKey: overrides.privateKey ?? process.env.OG_PRIVATE_KEY,
  };
}

export function requireSigningConfig(config: StorageConfig): asserts config is StorageConfig & {
  privateKey: string;
} {
  if (!config.privateKey) {
    throw new Error(
      "Missing OG_PRIVATE_KEY. Set it in your environment or .env file before uploading.",
    );
  }
}
