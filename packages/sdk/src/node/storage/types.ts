import type { StorageBackendId } from "../../bundle-ref.js";
import type { BundleFiles } from "../../types.js";
import type { UploadOptions } from "../storage-types.js";

export interface StorageUploadResult {
  /** bytes32 content address to register on-chain. */
  rootHash: string;
  /** Scheme-prefixed bundle URI: `0g://0x...` or `ipfs://Qm...`. */
  uri: string;
  backend: StorageBackendId;
  /** 0G-only extras. */
  txHash?: string;
  txSeq?: number;
  finalized?: boolean;
}

export interface StorageBackend {
  readonly id: StorageBackendId;
  upload(bundleDir: string, options?: UploadOptions): Promise<StorageUploadResult>;
  /**
   * Fetch and extract a bundle into `outDir` (a temp dir when omitted).
   * `ref` may be a bare `0x` root hash, a `Qm...` CID, or a scheme-prefixed
   * URI the backend understands.
   */
  fetch(ref: string, outDir?: string): Promise<BundleFiles>;
}
