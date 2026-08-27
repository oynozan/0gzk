import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import * as tar from "tar";

import type { BundleFiles, CircuitMetadata } from "../../types.js";

export const REQUIRED_FILES = [
  "metadata.json",
  "circuit.wasm",
  "circuit_final.zkey",
  "verification_key.json",
] as const;

export const TAR_NAME = "bundle.tar.gz";

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function makeTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function listBundleFiles(bundleDir: string): Promise<string[]> {
  const entries = await fs.readdir(bundleDir, { withFileTypes: true });
  return entries
    .filter((e) => e.isFile() && e.name !== TAR_NAME)
    .map((e) => e.name)
    .sort();
}

/** Validate required files and produce a portable gzip tarball in a temp dir. */
export async function packBundle(bundleDir: string): Promise<string> {
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

export async function extractTarball(tarPath: string, targetDir: string): Promise<void> {
  await tar.extract({
    file: tarPath,
    cwd: targetDir,
  });
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
