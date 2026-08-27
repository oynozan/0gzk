import "server-only";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { BundleFiles } from "@0gzk/sdk";
import {
  fetchBundle,
  loadConfig,
  parseBundleRef,
  readBundleFromDir,
} from "@0gzk/sdk/node";
import { hashVkey } from "@0gzk/sdk/build";

import { resolveNameToRecord } from "./registry";

function defaultCacheDir(): string {
  if (process.env.OGZK_CACHE_DIR) return path.resolve(process.env.OGZK_CACHE_DIR);
  return path.join(os.homedir(), ".0gzk", "bundles");
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export interface ResolvedBundle {
  bundle: BundleFiles;
  cached: boolean;
  cacheDir: string;
  rootHash: string;
  registry?: {
    name: string;
    version: string;
    vkeyHash: string;
    verifier: string;
    publisher: string;
    publishedAt: number;
    metadataURI: string;
  };
}

export async function resolveBundleByRootHash(
  rootHash: string,
  fetchRef?: string,
): Promise<ResolvedBundle> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(rootHash)) {
    throw new Error(
      `Invalid root hash (expected 0x + 64 hex chars): ${rootHash}`,
    );
  }

  const cacheRoot = defaultCacheDir();
  const cacheDir = path.join(cacheRoot, rootHash.toLowerCase());
  const cachedMetadata = path.join(cacheDir, "metadata.json");

  if (await pathExists(cachedMetadata)) {
    const bundle = await readBundleFromDir(cacheDir);
    return { bundle, cached: true, cacheDir, rootHash };
  }

  await fs.mkdir(cacheDir, { recursive: true });
  const config = loadConfig({});
  try {
    const bundle = await fetchBundle(fetchRef ?? rootHash, config, cacheDir);
    return { bundle, cached: false, cacheDir, rootHash };
  } catch (err) {
    await fs.rm(cacheDir, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
}

/**
 * Resolve a `<name>` or `<name>@<version>` registry spec into a fetched
 * bundle. Looks up the record on-chain, routes to the storage backend named
 * by its metadataURI (0G Storage or IPFS), and reuses the same on-disk cache
 * as `resolveBundleByRootHash` (cache key = rootHash, backend-independent).
 */
export async function resolveBundleByName(
  spec: string,
): Promise<ResolvedBundle> {
  const record = await resolveNameToRecord(spec);
  const ref = parseBundleRef(record);
  const inner = await resolveBundleByRootHash(
    record.rootHash,
    ref.backend === "ipfs" ? `ipfs://${ref.ref}` : record.rootHash,
  );
  if (!inner.cached) {
    const computed = hashVkey(inner.bundle.vkey);
    if (computed.toLowerCase() !== record.vkeyHash.toLowerCase()) {
      console.warn(
        `[0gzk] fetched bundle vkey hash ${computed} does not match registry ` +
          `record ${record.vkeyHash} for ${record.name}@${record.version}`,
      );
    }
  }
  return {
    ...inner,
    registry: {
      name: record.name,
      version: record.version,
      vkeyHash: record.vkeyHash,
      verifier: record.verifier,
      publisher: record.publisher,
      publishedAt: record.publishedAt,
      metadataURI: record.metadataURI,
    },
  };
}
