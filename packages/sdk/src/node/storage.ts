import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";

import { Indexer, ZgFile } from "@0gfoundation/0g-ts-sdk";
import { ethers } from "ethers";
import * as tar from "tar";

import type { StorageConfig } from "./config.js";
import { requireSigningConfig } from "./config.js";
import type { BundleFiles, CircuitMetadata } from "../types.js";
import type { UploadOptions, UploadProgress } from "./storage-types.js";
import {
  interceptUploadLogs,
  makeEmitter,
  withTimeout,
  type ProgressTracker,
} from "./upload-internals.js";

export type { UploadOptions, UploadProgress, UploadStage } from "./storage-types.js";

export interface UploadResult {
  rootHash: string;
  txHash: string;
  txSeq: number;
}

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

const REQUIRED_FILES = [
  "metadata.json",
  "circuit.wasm",
  "circuit_final.zkey",
  "verification_key.json",
] as const;

const TAR_NAME = "bundle.tar.gz";

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function listBundleFiles(bundleDir: string): Promise<string[]> {
  const entries = await fs.readdir(bundleDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name !== TAR_NAME)
    .map((e) => e.name)
    .sort();
}

async function packBundle(bundleDir: string): Promise<string> {
  for (const required of REQUIRED_FILES) {
    if (!(await pathExists(path.join(bundleDir, required)))) {
      throw new Error(`Bundle is missing required file: ${required}`);
    }
  }

  const files = await listBundleFiles(bundleDir);
  const tmpDir = await makeTempDir("0gzk-pack-");
  const tarPath = path.join(tmpDir, TAR_NAME);

  await tar.create(
    {
      gzip: true,
      file: tarPath,
      cwd: bundleDir,
      portable: true,
    },
    files,
  );

  return tarPath;
}

export async function readBundleFromDir(bundleDir: string): Promise<BundleFiles> {
  const metadataRaw = await fs.readFile(path.join(bundleDir, "metadata.json"), "utf8");
  const metadata = JSON.parse(metadataRaw) as CircuitMetadata;

  const wasm = await fs.readFile(path.join(bundleDir, metadata.files.wasm));
  const zkey = await fs.readFile(path.join(bundleDir, metadata.files.zkey));
  const vkeyRaw = await fs.readFile(path.join(bundleDir, metadata.files.vkey), "utf8");
  const vkey = JSON.parse(vkeyRaw) as unknown;

  let verifier: string | undefined;
  if (metadata.files.verifier) {
    const verifierPath = path.join(bundleDir, metadata.files.verifier);
    if (await pathExists(verifierPath)) {
      verifier = await fs.readFile(verifierPath, "utf8");
    }
  }

  return {
    wasm: new Uint8Array(wasm.buffer, wasm.byteOffset, wasm.byteLength),
    zkey: new Uint8Array(zkey.buffer, zkey.byteOffset, zkey.byteLength),
    vkey,
    metadata,
    verifier,
  };
}

export async function uploadBundle(
  bundleDir: string,
  config: StorageConfig,
  options: UploadOptions = {},
): Promise<UploadResult> {
  requireSigningConfig(config);

  const absBundleDir = path.resolve(bundleDir);
  if (!(await pathExists(absBundleDir))) {
    throw new Error(`Bundle directory does not exist: ${absBundleDir}`);
  }

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

    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
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
      config.rpcUrl,
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

    const result: UploadResult =
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
      rootHash: result.rootHash,
      finalized: true,
    });
    return result;
  } finally {
    restoreConsole();
    if (file) {
      await file.close().catch(() => undefined);
    }
    await fs.rm(tarTmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export async function fetchBundle(
  rootHash: string,
  config: Pick<StorageConfig, "indexerUrl">,
  outputDir?: string,
): Promise<BundleFiles> {
  const targetDir =
    outputDir !== undefined
      ? path.resolve(outputDir)
      : await makeTempDir(`0gzk-fetch-${randomUUID().slice(0, 8)}-`);

  await fs.mkdir(targetDir, { recursive: true });

  const tarPath = path.join(targetDir, TAR_NAME);
  if (await pathExists(tarPath)) {
    await fs.rm(tarPath, { force: true });
  }

  const indexer = new Indexer(config.indexerUrl);
  const downloadErr = await indexer.download(rootHash, tarPath, true);
  if (downloadErr) {
    throw new Error(`0G download failed: ${downloadErr.message}`);
  }

  await tar.extract({
    file: tarPath,
    cwd: targetDir,
  });

  return readBundleFromDir(targetDir);
}
