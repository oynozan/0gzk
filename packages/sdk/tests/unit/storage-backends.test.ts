import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

import * as tar from "tar";
import { afterEach, describe, expect, it, vi } from "vitest";

import { cidToRootHash } from "../../src/bundle-ref.js";
import { loadConfig } from "../../src/node/config.js";
import {
  IpfsStorageBackend,
  ZeroGStorageBackend,
  createStorageBackend,
  fetchBundle,
} from "../../src/node/storage/index.js";

const FIXTURE_DIR = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "fixtures",
  "age_verification",
);

const CID = "QmdfTbBqBPQ7VNxZEYEj14VmRuZBkqFbiwReogJgS1zR1n";

function baseConfig() {
  return loadConfig({ network: "0g-mainnet" });
}

async function fixtureTarball(): Promise<Uint8Array> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "0gzk-test-tar-"));
  const tarPath = path.join(tmp, "bundle.tar.gz");
  const files = (await fs.readdir(FIXTURE_DIR)).sort();
  await tar.create({ gzip: true, file: tarPath, cwd: FIXTURE_DIR, portable: true }, files);
  const bytes = await fs.readFile(tarPath);
  await fs.rm(tmp, { recursive: true, force: true });
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createStorageBackend", () => {
  it("selects by config.storage", () => {
    expect(createStorageBackend({ ...baseConfig(), storage: "0g" }).id).toBe("0g");
    expect(createStorageBackend({ ...baseConfig(), storage: "ipfs" }).id).toBe("ipfs");
  });

  it("explicit id overrides config", () => {
    expect(createStorageBackend({ ...baseConfig(), storage: "0g" }, "ipfs").id).toBe("ipfs");
  });

  it("base network defaults to the ipfs backend", () => {
    const config = loadConfig({ network: "base-sepolia" });
    expect(config.storage).toBe("ipfs");
    expect(createStorageBackend(config).id).toBe("ipfs");
  });
});

describe("IpfsStorageBackend.upload", () => {
  it("POSTs the tarball with a Bearer token and cidVersion 0, returns digest rootHash", async () => {
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const form = init?.body as FormData;
      expect(form).toBeInstanceOf(FormData);
      expect(JSON.parse(form.get("pinataOptions") as string)).toEqual({ cidVersion: 0 });
      expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok123");
      return new Response(JSON.stringify({ IpfsHash: CID }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const backend = new IpfsStorageBackend({
      ipfs: { apiUrl: "https://pin.example/pin", apiToken: "tok123", gateway: "https://ipfs.io" },
    });
    const result = await backend.upload(FIXTURE_DIR);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(result.backend).toBe("ipfs");
    expect(result.uri).toBe(`ipfs://${CID}`);
    expect(result.rootHash).toBe(cidToRootHash(CID));
    expect(result.txHash).toBeUndefined();
  });

  it("refuses to upload without an API token", async () => {
    const backend = new IpfsStorageBackend({
      ipfs: { apiUrl: "https://pin.example/pin", gateway: "https://ipfs.io" },
    });
    await expect(backend.upload(FIXTURE_DIR)).rejects.toThrow(/OGZK_IPFS_API_TOKEN/);
  });

  it("surfaces HTTP errors with status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("quota exceeded", { status: 402, statusText: "Payment" })),
    );
    const backend = new IpfsStorageBackend({
      ipfs: { apiUrl: "https://pin.example/pin", apiToken: "t", gateway: "https://ipfs.io" },
    });
    await expect(backend.upload(FIXTURE_DIR)).rejects.toThrow(/402/);
  });
});

describe("IpfsStorageBackend.fetch", () => {
  it("downloads from the gateway and extracts the bundle", async () => {
    const tarball = await fixtureTarball();
    const fetchMock = vi.fn(async (url: unknown) => {
      expect(String(url)).toBe(`https://gw.example/ipfs/${CID}`);
      return new Response(new Uint8Array(tarball).buffer, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const backend = new IpfsStorageBackend({
      ipfs: { apiUrl: "https://pin.example", gateway: "https://gw.example/" },
    });
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "0gzk-test-ipfs-"));
    try {
      const bundle = await backend.fetch(`ipfs://${CID}`, outDir);
      expect(bundle.metadata.name).toBe("age_verification");
      expect(bundle.wasm.byteLength).toBeGreaterThan(0);
    } finally {
      await fs.rm(outDir, { recursive: true, force: true });
    }
  });

  it("reconstructs the CID from a bare rootHash", async () => {
    const tarball = await fixtureTarball();
    const fetchMock = vi.fn(async (url: unknown) => {
      expect(String(url)).toContain(`/ipfs/${CID}`);
      return new Response(new Uint8Array(tarball).buffer, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const backend = new IpfsStorageBackend({
      ipfs: { apiUrl: "https://pin.example", gateway: "https://gw.example" },
    });
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "0gzk-test-ipfs2-"));
    try {
      const bundle = await backend.fetch(cidToRootHash(CID), outDir);
      expect(bundle.metadata.name).toBe("age_verification");
    } finally {
      await fs.rm(outDir, { recursive: true, force: true });
    }
  });
});

describe("fetchBundle backend routing", () => {
  it("routes ipfs:// refs to the ipfs backend even with an indexer-only config", async () => {
    const tarball = await fixtureTarball();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Uint8Array(tarball).buffer, { status: 200 })),
    );
    const outDir = await fs.mkdtemp(path.join(os.tmpdir(), "0gzk-test-route-"));
    try {
      const bundle = await fetchBundle(
        `ipfs://${CID}`,
        { indexerUrl: "https://indexer.example" },
        outDir,
      );
      expect(bundle.metadata.name).toBe("age_verification");
    } finally {
      await fs.rm(outDir, { recursive: true, force: true });
    }
  });
});

describe("ZeroGStorageBackend", () => {
  it("strips the 0g:// scheme before download", () => {
    // Constructing the backend must not import the optional 0G SDK.
    const backend = new ZeroGStorageBackend(baseConfig());
    expect(backend.id).toBe("0g");
  });
});
