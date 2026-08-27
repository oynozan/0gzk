import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";

import {
  PtauIntegrityError,
  blake2b512File,
  defaultPtauCacheDir,
  fetchPowersOfTau,
  ptauFileName,
  ptauUrl,
} from "../../src/build/ptau.js";
import { assembleBundle } from "../../src/build/assemble.js";
import { canonicalJSON, hashVkey } from "../../src/build/vkey.js";

async function tmp(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

describe("ptau name + url", () => {
  it("formats Hermez ceremony filenames consistently", () => {
    expect(ptauFileName(12)).toBe("powersOfTau28_hez_final_12.ptau");
    expect(ptauFileName(13)).toBe("powersOfTau28_hez_final_13.ptau");
  });

  it("points at the canonical Google Cloud Storage mirror", () => {
    expect(ptauUrl(12)).toBe(
      "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_12.ptau",
    );
  });

  it("returns an OS-conventional cache dir", () => {
    const dir = defaultPtauCacheDir();
    expect(dir.endsWith(path.join("0gzk", "ptau"))).toBe(true);
  });
});

describe("blake2b512File", () => {
  let work: string;
  beforeEach(async () => {
    work = await tmp("0gzk-ptau-blake-");
  });
  afterEach(async () => {
    await fs.rm(work, { recursive: true, force: true });
  });

  it("matches the standard test vector for 'abc'", async () => {
    const file = path.join(work, "abc.bin");
    await fs.writeFile(file, "abc");
    const hex = await blake2b512File(file);
    expect(hex).toBe(
      "ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923",
    );
  });

  it("hashes empty files to the all-zeros-input vector", async () => {
    const file = path.join(work, "empty.bin");
    await fs.writeFile(file, "");
    const hex = await blake2b512File(file);
    expect(hex).toBe(
      "786a02f742015903c6c6fd852552d272912f4740e15847618a86e217f71f5419d25e1031afee585313896444934eb04b903a685b1448b755d56f701afe9be2ce",
    );
  });
});

describe("fetchPowersOfTau", () => {
  let cache: string;
  beforeEach(async () => {
    cache = await tmp("0gzk-ptau-cache-");
  });
  afterEach(async () => {
    await fs.rm(cache, { recursive: true, force: true });
  });

  it("returns the cached path on a hit (no network)", async () => {
    const fakeFile = path.join(cache, ptauFileName(12));
    await fs.writeFile(fakeFile, "fake-but-cached");
    const out = await fetchPowersOfTau(12, {
      cacheDir: cache,
      skipIntegrityCheck: true,
    });
    expect(out).toBe(fakeFile);
  });

  it("rejects with PtauIntegrityError when the cached blob's blake2b doesn't match", async () => {
    const fakeFile = path.join(cache, ptauFileName(12));
    await fs.writeFile(fakeFile, "wrong-bytes");
    await expect(fetchPowersOfTau(12, { cacheDir: cache })).rejects.toBeInstanceOf(
      PtauIntegrityError,
    );
  });

  it("rejects when no hash is registered for the requested size", async () => {
    await expect(fetchPowersOfTau(99, { cacheDir: cache })).rejects.toThrow(
      /No BLAKE2b hash registered for ptau size 99/,
    );
  });
});

describe("canonicalJSON + hashVkey", () => {
  it("ignores key order when canonicalising objects", () => {
    expect(canonicalJSON({ b: 1, a: 2 })).toBe(canonicalJSON({ a: 2, b: 1 }));
  });

  it("preserves array order", () => {
    expect(canonicalJSON([1, 2, 3])).toBe("[1,2,3]");
    expect(canonicalJSON([1, 2, 3])).not.toBe(canonicalJSON([3, 2, 1]));
  });

  it("hashes equivalent vkeys to the same digest regardless of key order", () => {
    const a = hashVkey({ protocol: "groth16", curve: "bn128", power: 12 });
    const b = hashVkey({ power: 12, curve: "bn128", protocol: "groth16" });
    expect(a).toBe(b);
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
  });
});

describe("assembleBundle", () => {
  let work: string;
  beforeEach(async () => {
    work = await tmp("0gzk-assemble-");
  });
  afterEach(async () => {
    await fs.rm(work, { recursive: true, force: true });
  });

  it("lays out the four artifact files using the names from metadata.json", async () => {
    const inDir = path.join(work, "in");
    const outDir = path.join(work, "out");
    await fs.mkdir(inDir, { recursive: true });

    const metadata = {
      name: "fixture",
      version: "0.1.0",
      protocol: "groth16" as const,
      curve: "bn128" as const,
      inputs: {},
      outputs: {},
      files: {
        wasm: "circuit.wasm",
        zkey: "circuit_final.zkey",
        vkey: "verification_key.json",
        verifier: "verifier.sol",
      },
    };

    await fs.writeFile(path.join(inDir, "metadata.json"), JSON.stringify(metadata));
    await fs.writeFile(path.join(inDir, "fixture.wasm"), "wasm-bytes");
    await fs.writeFile(path.join(inDir, "final.zkey"), "zkey-bytes");
    await fs.writeFile(
      path.join(inDir, "vkey.json"),
      JSON.stringify({ protocol: "groth16", curve: "bn128" }),
    );
    await fs.writeFile(path.join(inDir, "verifier.sol"), "// verifier");

    const result = await assembleBundle({
      wasmPath: path.join(inDir, "fixture.wasm"),
      zkeyPath: path.join(inDir, "final.zkey"),
      vkeyPath: path.join(inDir, "vkey.json"),
      verifierSolPath: path.join(inDir, "verifier.sol"),
      metadataPath: path.join(inDir, "metadata.json"),
      outputDir: outDir,
    });

    const layout = (await fs.readdir(outDir)).sort();
    expect(layout).toEqual([
      "circuit.wasm",
      "circuit_final.zkey",
      "metadata.json",
      "verification_key.json",
      "verifier.sol",
    ]);

    expect(result.vkeyHash).toBe(
      hashVkey({ protocol: "groth16", curve: "bn128" }),
    );
    expect(result.metadata.name).toBe("fixture");
    expect(result.files.verifier).toBe(path.join(outDir, "verifier.sol"));
  });

  it("omits verifier.sol when neither input nor metadata declares one", async () => {
    const inDir = path.join(work, "in");
    const outDir = path.join(work, "out");
    await fs.mkdir(inDir, { recursive: true });

    const metadata = {
      name: "fixture",
      version: "0.1.0",
      protocol: "groth16" as const,
      curve: "bn128" as const,
      inputs: {},
      outputs: {},
      files: {
        wasm: "circuit.wasm",
        zkey: "circuit_final.zkey",
        vkey: "verification_key.json",
      },
    };

    await fs.writeFile(path.join(inDir, "metadata.json"), JSON.stringify(metadata));
    await fs.writeFile(path.join(inDir, "fixture.wasm"), "wasm-bytes");
    await fs.writeFile(path.join(inDir, "final.zkey"), "zkey-bytes");
    await fs.writeFile(path.join(inDir, "vkey.json"), JSON.stringify({}));

    const result = await assembleBundle({
      wasmPath: path.join(inDir, "fixture.wasm"),
      zkeyPath: path.join(inDir, "final.zkey"),
      vkeyPath: path.join(inDir, "vkey.json"),
      metadataPath: path.join(inDir, "metadata.json"),
      outputDir: outDir,
    });

    expect(result.files.verifier).toBeUndefined();
    const layout = (await fs.readdir(outDir)).sort();
    expect(layout).toEqual([
      "circuit.wasm",
      "circuit_final.zkey",
      "metadata.json",
      "verification_key.json",
    ]);
  });

  it("throws when metadata.json is missing required `files` entries", async () => {
    const inDir = path.join(work, "in");
    await fs.mkdir(inDir, { recursive: true });
    await fs.writeFile(
      path.join(inDir, "metadata.json"),
      JSON.stringify({ name: "x", version: "0.1.0", files: { wasm: "circuit.wasm" } }),
    );
    await fs.writeFile(path.join(inDir, "x.wasm"), "x");

    await expect(
      assembleBundle({
        wasmPath: path.join(inDir, "x.wasm"),
        zkeyPath: path.join(inDir, "x.wasm"),
        vkeyPath: path.join(inDir, "x.wasm"),
        metadataPath: path.join(inDir, "metadata.json"),
        outputDir: path.join(work, "out"),
      }),
    ).rejects.toThrow(/missing required `files` entries/);
  });
});
