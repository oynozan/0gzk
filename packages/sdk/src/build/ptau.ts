import { promises as fs, createWriteStream } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as crypto from "node:crypto";

/**
 * Powers of Tau download + integrity helpers for the SDK build flow.
 *
 * The Hermez ceremony files live at a fixed Google Cloud Storage URL keyed by
 * power-of-two exponent. They're a *universal* trusted setup: one file per
 * size class (e.g. `_12.ptau` covers any circuit up to 2^12 = 4096
 * constraints), reusable across every circuit you ever build at that size.
 *
 * We mirror the BLAKE2b-512 hashes from `circuits/_lib/build_lib.sh` so an
 * intermediary that swaps the file out is caught before it ever reaches
 * `groth16 setup`. Add a row to `PTAU_BLAKE2B` when introducing a new size.
 */

/** BLAKE2b-512 hex digests for the official Hermez ceremony ptau files. */
export const PTAU_BLAKE2B: Readonly<Record<number, string>> = Object.freeze({
  12: "ded2694169b7b08e898f736d5de95af87c3f1a64594013351b1a796dbee393bd825f88f9468c84505ddd11eb0b1465ac9b43b9064aa8ec97f2b73e04758b8a4a",
  13: "58efc8bf2834d04768a3d7ffcd8e1e23d461561729beaac4e3e7a47829a1c9066d5320241e124a1a8e8aa6c75be0ba66f65bc8239a0542ed38e11276f6fdb4d9",
});

export function ptauFileName(size: number): string {
  return `powersOfTau28_hez_final_${size}.ptau`;
}

export function ptauUrl(size: number): string {
  return `https://storage.googleapis.com/zkevm/ptau/${ptauFileName(size)}`;
}

/**
 * Default on-disk cache directory for ptau files. Same shape as `pip`'s and
 * `npm`'s caches: per-user, hidden, OS-conventional.
 *   - Linux/macOS: `~/.cache/0gzk/ptau`
 *   - Windows:     `%LOCALAPPDATA%\0gzk\ptau` (or `~\AppData\Local\0gzk\ptau`)
 */
export function defaultPtauCacheDir(): string {
  if (process.platform === "win32") {
    const localAppData =
      process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
    return path.join(localAppData, "0gzk", "ptau");
  }
  const xdg = process.env.XDG_CACHE_HOME;
  const base = xdg && xdg.length > 0 ? xdg : path.join(os.homedir(), ".cache");
  return path.join(base, "0gzk", "ptau");
}

export class PtauIntegrityError extends Error {
  override readonly name = "PtauIntegrityError";
  constructor(
    public readonly size: number,
    public readonly expected: string,
    public readonly actual: string,
    public readonly filePath: string,
  ) {
    super(
      `Powers of Tau hash mismatch for size ${size} (${path.basename(filePath)}).\n` +
        `  expected: ${expected}\n` +
        `  actual:   ${actual}\n` +
        `Delete ${filePath} and retry. If the mismatch persists, the file you ` +
        `are downloading is not the canonical Hermez ceremony output.`,
    );
  }
}

/**
 * BLAKE2b-512 of a file on disk, hex-encoded. Streams the file so we never
 * load the whole ptau (typically 100 MB - 1 GB) into memory.
 */
export async function blake2b512File(filePath: string): Promise<string> {
  const hash = crypto.createHash("blake2b512");
  const handle = await fs.open(filePath, "r");
  try {
    const stream = handle.createReadStream({ highWaterMark: 1 << 20 });
    for await (const chunk of stream) {
      hash.update(chunk as Buffer);
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download `url` to `destPath` via the global `fetch` (Node 18+ ships it).
 * Writes to a `.partial` sibling first, then renames atomically. Throws on
 * non-2xx responses.
 */
async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(
      `Download failed (HTTP ${response.status}) for ${url}. ` +
        `The Hermez mirror occasionally rate-limits; retry in a minute.`,
    );
  }

  const partial = `${destPath}.partial`;
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  const out = createWriteStream(partial);

  try {
    const reader = response.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        await new Promise<void>((resolve, reject) => {
          out.write(value, (err) => (err ? reject(err) : resolve()));
        });
      }
    }
  } catch (err) {
    out.destroy();
    await fs.rm(partial, { force: true }).catch(() => undefined);
    throw err;
  }

  await new Promise<void>((resolve, reject) => {
    out.end((err: Error | null | undefined) => (err ? reject(err) : resolve()));
  });

  await fs.rename(partial, destPath);
}

export interface FetchPtauOptions {
  cacheDir?: string;
  /** Skip the BLAKE2b integrity check. False by default; only set true for tests. */
  skipIntegrityCheck?: boolean;
}

/**
 * Resolve a ptau file for the given size, downloading + caching if necessary,
 * and verifying its BLAKE2b-512 hash against the embedded ceremony table.
 * Returns the absolute path to the verified ptau.
 *
 * Cache hits are integrity-checked too — a corrupted cache file can otherwise
 * silently break every subsequent `setup` call.
 */
export async function fetchPowersOfTau(
  size: number,
  options: FetchPtauOptions = {},
): Promise<string> {
  const expected = PTAU_BLAKE2B[size];
  if (!options.skipIntegrityCheck && !expected) {
    throw new Error(
      `No BLAKE2b hash registered for ptau size ${size}. ` +
        `Add a row to packages/sdk/src/build/ptau.ts (PTAU_BLAKE2B) and ` +
        `cross-check it against the snarkjs README.`,
    );
  }

  const cacheDir = options.cacheDir ?? defaultPtauCacheDir();
  await fs.mkdir(cacheDir, { recursive: true });
  const dest = path.join(cacheDir, ptauFileName(size));

  if (!(await pathExists(dest))) {
    await downloadFile(ptauUrl(size), dest);
  }

  if (!options.skipIntegrityCheck && expected) {
    const actual = await blake2b512File(dest);
    if (actual !== expected) {
      throw new PtauIntegrityError(size, expected, actual, dest);
    }
  }

  return dest;
}
