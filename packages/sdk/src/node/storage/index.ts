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
 * Fetch and extract a bundle. `ref` may be an `ipfs://<cid>` / `Qm...`
 * reference, a `0g://0x...` URI, or a bare `0x` root hash.
 *
 * A bare hash is ambiguous — both backends address content by 32 bytes. It
 * resolves to 0G Storage unless the caller explicitly asked for IPFS
 * (`config.storage === "ipfs"` set deliberately rather than inherited from
 * the network preset). Inheriting it would break `fetch 0x…` / `prove
 * --root-hash 0x…` for every 0G bundle now that Base (and therefore IPFS)
 * is the default network.
 */
export async function fetchBundle(
  ref: string,
  config: FetchConfig & { storageExplicit?: boolean },
  outputDir?: string,
): Promise<BundleFiles> {
  const fromRef = backendForRef(ref);
  const backend = fromRef ?? (config.storageExplicit && config.storage ? config.storage : "0g");
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
