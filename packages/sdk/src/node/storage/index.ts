import { backendForRef, type StorageBackendId } from "../../bundle-ref.js";
import type { BundleFiles } from "../../types.js";
import type { StorageConfig } from "../config.js";
import type { UploadOptions } from "../storage-types.js";
import { IpfsStorageBackend } from "./ipfs.js";
import { ZeroGStorageBackend } from "./zerog.js";
import type { StorageBackend, StorageUploadResult } from "./types.js";

export type { UploadOptions, UploadProgress, UploadStage } from "../storage-types.js";
export type { StorageBackend, StorageUploadResult } from "./types.js";
export { UploadTimeoutError, ZeroGStorageBackend } from "./zerog.js";
export { IpfsStorageBackend } from "./ipfs.js";
export { readBundleFromDir } from "./shared.js";
export { backendForRef } from "../../bundle-ref.js";

/**
 * Result of `uploadBundle`. `txHash`/`txSeq` are 0G-only and absent on IPFS
 * uploads (breaking type change in 0.4.0: they used to be required).
 */
export type UploadResult = StorageUploadResult;

const DEFAULT_IPFS_API_URL = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const DEFAULT_IPFS_GATEWAY = "https://gateway.pinata.cloud";

type FetchConfig = Pick<StorageConfig, "indexerUrl"> &
  Partial<Pick<StorageConfig, "storage" | "storageNetwork" | "network" | "rpcUrl" | "ipfs">>;

function ipfsBackendFrom(config: FetchConfig | StorageConfig): IpfsStorageBackend {
  return new IpfsStorageBackend({
    ipfs: {
      apiUrl: config.ipfs?.apiUrl ?? DEFAULT_IPFS_API_URL,
      apiToken: config.ipfs?.apiToken,
      gateway: config.ipfs?.gateway ?? DEFAULT_IPFS_GATEWAY,
    },
  });
}

export function createStorageBackend(
  config: StorageConfig,
  id?: StorageBackendId,
): StorageBackend {
  const backend = id ?? config.storage;
  if (backend === "ipfs") return ipfsBackendFrom(config);
  return new ZeroGStorageBackend(config);
}

/** Upload a bundle directory via the backend selected by `config.storage`. */
export async function uploadBundle(
  bundleDir: string,
  config: StorageConfig,
  options: UploadOptions = {},
): Promise<UploadResult> {
  return createStorageBackend(config).upload(bundleDir, options);
}

/**
 * Fetch and extract a bundle. `ref` may be a bare `0x` root hash (backend
 * chosen by `config.storage`, defaulting to 0G — today's behavior), an
 * `ipfs://<cid>` / `Qm...` reference, or a `0g://0x...` URI.
 */
export async function fetchBundle(
  ref: string,
  config: FetchConfig,
  outputDir?: string,
): Promise<BundleFiles> {
  const backend = backendForRef(ref) ?? config.storage ?? "0g";
  if (backend === "ipfs") {
    return ipfsBackendFrom(config).fetch(ref, outputDir);
  }
  const zerog = new ZeroGStorageBackend({
    // fetch only needs indexerUrl; fill the rest with harmless placeholders.
    network: config.network ?? "0g-mainnet",
    chainId: 0,
    rpcUrl: config.rpcUrl ?? "",
    explorer: "",
    indexerUrl: config.indexerUrl,
    storage: "0g",
    storageNetwork: config.storageNetwork ?? "0g-mainnet",
    ipfs: { apiUrl: DEFAULT_IPFS_API_URL, gateway: DEFAULT_IPFS_GATEWAY },
  });
  return zerog.fetch(ref, outputDir);
}
