import { promises as fs } from "node:fs";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

import type { ZgFile } from "@0gfoundation/0g-ts-sdk";

import { NETWORKS } from "../../networks.js";
import type { BundleFiles } from "../../types.js";
import type { StorageConfig } from "../config.js";
import { requireSigningConfig } from "../config.js";
import type { UploadOptions, UploadProgress } from "../storage-types.js";
import {
  interceptUploadLogs,
  makeEmitter,
  withTimeout,
  type ProgressTracker,
} from "../upload-internals.js";
import {
  TAR_NAME,
  extractTarball,
  makeTempDir,
  packBundle,
  pathExists,
  readBundleFromDir,
} from "./shared.js";
import type { StorageBackend, StorageUploadResult } from "./types.js";

/**
 * Thrown when an upload exceeds `UploadOptions.timeoutMs`. If `rootHash` is
 * defined, the data is already on chain (submission landed) — the timeout
 * elapsed while waiting for storage-node finalization, which is asynchronous
 * and out of our control. Callers can register `rootHash` on `CircuitRegistry`
 * directly and finalize later.
 */
export class UploadTimeoutError extends Error {
  override readonly name = "UploadTimeoutError";
  constructor(
    public readonly timeoutMs: number,
    public readonly rootHash?: string,
    public readonly lastProgress?: UploadProgress,
  ) {
    super(
      rootHash
        ? `0G upload not finalized after ${Math.round(timeoutMs / 1000)}s ` +
            `(rootHash already on chain: ${rootHash}). ` +
            "Finalization continues asynchronously; you can register and prove now."
        : `0G upload did not start within ${Math.round(timeoutMs / 1000)}s. ` +
            "No rootHash assigned yet. Check your RPC and indexer URLs.",
    );
  }
}

const DEFAULT_UPLOAD_TIMEOUT_MS = 5 * 60_000;

type ZgSdk = typeof import("@0gfoundation/0g-ts-sdk");
type EthersSdk = typeof import("ethers");

let zgSdkPromise: Promise<ZgSdk> | undefined;

async function loadZgSdk(): Promise<ZgSdk> {
  zgSdkPromise ??= import("@0gfoundation/0g-ts-sdk").catch((cause) => {
    zgSdkPromise = undefined;
    throw new Error(
      "The 0G Storage backend needs the optional peer dependency " +
        "@0gfoundation/0g-ts-sdk. Install it with: npm i @0gfoundation/0g-ts-sdk",
      { cause },
    );
  });
  return zgSdkPromise;
}

/**
 * The chain the 0G Storage flow contract lives on. When the configured
 * registry network IS that 0G chain, honor any user RPC override; otherwise
 * (registry on Base etc.) fall back to the storage chain's preset RPC.
 */
function storageRpcUrl(config: StorageConfig): string {
  return config.network === config.storageNetwork
    ? config.rpcUrl
    : NETWORKS[config.storageNetwork].rpcUrl;
}

export class ZeroGStorageBackend implements StorageBackend {
  readonly id = "0g" as const;

  constructor(private readonly config: StorageConfig) {}

  async upload(bundleDir: string, options: UploadOptions = {}): Promise<StorageUploadResult> {
    const config = this.config;
    requireSigningConfig(config);

    const absBundleDir = path.resolve(bundleDir);
    if (!(await pathExists(absBundleDir))) {
      throw new Error(`Bundle directory does not exist: ${absBundleDir}`);
    }

    const { Indexer, ZgFile } = await loadZgSdk();
    const ethers: EthersSdk = await import("ethers");

    const emit = makeEmitter(options.onProgress);
    emit({ stage: "packing", message: "Packing bundle tarball" });
    const tarPath = await packBundle(absBundleDir);
    const tarTmpDir = path.dirname(tarPath);

    const tracker: ProgressTracker = { lastProgress: undefined, rootHash: undefined };
    const restoreConsole = interceptUploadLogs(emit, tracker);

    let file: ZgFile | null = null;
    try {
      file = await ZgFile.fromFilePath(tarPath);

      const [tree, treeErr] = await file.merkleTree();
      if (treeErr) {
        throw new Error(`Merkle tree generation failed: ${treeErr.message}`);
      }

      // The bundle's content-addressed rootHash is fully determined by the
      // tarball bytes — capture it now so callers (and UploadTimeoutError) have
      // it even if the upload tx never confirms.
      const computedRootHash = tree?.rootHash() ?? undefined;
      if (computedRootHash) {
        tracker.rootHash = computedRootHash;
      }

      const rpcUrl = storageRpcUrl(config);
      const provider = new ethers.JsonRpcProvider(rpcUrl);
      const signer = new ethers.Wallet(config.privateKey, provider);
      const indexer = new Indexer(config.indexerUrl);

      emit({
        stage: "submitting",
        message: "Submitting upload transaction",
        rootHash: computedRootHash,
      });

      // Cast: @0gfoundation/0g-ts-sdk ships CJS-resolved ethers types while our
      // package resolves the ESM ones. Runtime types are identical; TS treats
      // them as distinct because ethers uses private fields.
      const uploadPromise = indexer.upload(
        file,
        rpcUrl,
        signer as unknown as Parameters<typeof indexer.upload>[2],
      );

      const timeoutMs = options.timeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS;
      const settled = await withTimeout(uploadPromise, timeoutMs);

      if (settled.kind === "timeout") {
        throw new UploadTimeoutError(timeoutMs, tracker.rootHash, tracker.lastProgress);
      }

      const [tx, uploadErr] = settled.value;
      if (uploadErr) {
        throw new Error(`0G upload failed: ${uploadErr.message}`);
      }

      const base =
        "rootHash" in tx
          ? { rootHash: tx.rootHash, txHash: tx.txHash, txSeq: tx.txSeq }
          : (() => {
              if (tx.rootHashes.length === 0) {
                throw new Error("0G upload returned no root hashes");
              }
              return {
                rootHash: tx.rootHashes[0]!,
                txHash: tx.txHashes[0]!,
                txSeq: tx.txSeqs[0]!,
              };
            })();

      emit({
        stage: "done",
        message: "Upload finalized",
        rootHash: base.rootHash,
        finalized: true,
      });
      return {
        ...base,
        uri: `0g://${base.rootHash.toLowerCase()}`,
        backend: "0g",
        finalized: true,
      };
    } finally {
      restoreConsole();
      if (file) {
        await file.close().catch(() => undefined);
      }
      await fs.rm(tarTmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async fetch(ref: string, outDir?: string): Promise<BundleFiles> {
    const rootHash = ref.startsWith("0g://") ? ref.slice("0g://".length) : ref;

    const targetDir =
      outDir !== undefined
        ? path.resolve(outDir)
        : await makeTempDir(`0gzk-fetch-${randomUUID().slice(0, 8)}-`);

    await fs.mkdir(targetDir, { recursive: true });

    const tarPath = path.join(targetDir, TAR_NAME);
    if (await pathExists(tarPath)) {
      await fs.rm(tarPath, { force: true });
    }

    const { Indexer } = await loadZgSdk();
    const indexer = new Indexer(this.config.indexerUrl);
    const downloadErr = await indexer.download(rootHash, tarPath, true);
    if (downloadErr) {
      throw new Error(`0G download failed: ${downloadErr.message}`);
    }

    await extractTarball(tarPath, targetDir);
    return readBundleFromDir(targetDir);
  }
}
