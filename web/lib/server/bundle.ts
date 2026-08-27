import "server-only";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import type { BundleFiles } from "@0gzk/sdk";
import { fetchBundle, loadConfig, readBundleFromDir } from "@0gzk/sdk/node";

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
    const bundle = await fetchBundle(rootHash, config, cacheDir);
    return { bundle, cached: false, cacheDir, rootHash };
  } catch (err) {
    await fs.rm(cacheDir, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
}

/**
 * Resolve a `<name>` or `<name>@<version>` registry spec into a fetched
 * bundle. Looks up the record on-chain, dereferences `rootHash`, and reuses
 * the same on-disk cache as `resolveBundleByRootHash`.
 */
export async function resolveBundleByName(
  spec: string,
): Promise<ResolvedBundle> {
  const record = await resolveNameToRecord(spec);
  const inner = await resolveBundleByRootHash(record.rootHash);
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
