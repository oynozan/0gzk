import { describe, expect, it, vi } from "vitest";

import {
  getVersion,
  getLatest,
  listCircuits,
  listVersions,
  parseNameSpec,
  resolveBundle,
  REGISTRY_ADDRESSES,
  getRegistryAddress,
} from "../../src/onchain/index.js";
import type { BundleFiles } from "../../src/types.js";

/**
 * We avoid spinning up anvil in unit tests by stubbing the ethers Contract
 * surface area we actually use: getFunction("name")(...args). The real
 * contract is exercised by the live e2e suite + the Foundry tests.
 */
function fakeContract(handlers: Record<string, (...args: unknown[]) => unknown>) {
  return {
    getFunction(name: string) {
      const h = handlers[name];
      if (!h) throw new Error(`unhandled call: ${name}`);
      return (...args: unknown[]) => Promise.resolve(h(...args));
    },
  } as unknown as Parameters<typeof getVersion>[0];
}

describe("onchain / decoders", () => {
  it("decodes getVersion into a flat record", async () => {
    const reg = fakeContract({
      getVersion: () => ({
        rootHash: "0xaa",
        vkeyHash: "0xbb",
        verifier: "0xcc",
        publisher: "0xdd",
        publishedAt: 1700000000n,
        metadataURI: "ipfs://meta",
      }),
    });

    const v = await getVersion(reg, "name", "0.1.0");
    expect(v).toEqual({
      rootHash: "0xaa",
      vkeyHash: "0xbb",
      verifier: "0xcc",
      publisher: "0xdd",
      publishedAt: 1700000000,
      metadataURI: "ipfs://meta",
    });
  });

  it("decodes getLatest tuple", async () => {
    const reg = fakeContract({
      getLatest: () => [
        "0.2.0",
        {
          rootHash: "0x01",
          vkeyHash: "0x02",
          verifier: "0x03",
          publisher: "0x04",
          publishedAt: 42,
          metadataURI: "",
        },
      ],
    });
    const out = await getLatest(reg, "x");
    expect(out.version).toBe("0.2.0");
    expect(out.record.publishedAt).toBe(42);
  });

  it("decodes listCircuits rows", async () => {
    const reg = fakeContract({
      listCircuits: (offset: unknown, limit: unknown) => {
        expect(offset).toBe(0);
        expect(limit).toBe(50);
        return [
          ["alpha", "0xaa", 2n, "0.2.0"],
          ["beta", "0xbb", 0n, ""],
        ];
      },
    });
    const out = await listCircuits(reg);
    expect(out).toEqual([
      { name: "alpha", owner: "0xaa", versionCount: 2, latestVersion: "0.2.0" },
      { name: "beta", owner: "0xbb", versionCount: 0, latestVersion: "" },
    ]);
  });

  it("forwards offset/limit to the contract", async () => {
    const reg = fakeContract({
      listCircuits: (offset: unknown, limit: unknown) => {
        expect(offset).toBe(10);
        expect(limit).toBe(5);
        return [];
      },
    });
    expect(await listCircuits(reg, { offset: 10, limit: 5 })).toEqual([]);
  });

  it("returns version list as string[]", async () => {
    const reg = fakeContract({
      listVersions: () => ["0.1.0", "0.2.0"],
    });
    expect(await listVersions(reg, "x")).toEqual(["0.1.0", "0.2.0"]);
  });
});

describe("onchain / resolveBundle", () => {
  const fakeBundle = {
    wasm: new Uint8Array([1]),
    zkey: new Uint8Array([2]),
    vkey: {},
    metadata: {
      name: "alpha",
      version: "0.1.0",
      protocol: "groth16",
      curve: "bn128",
      inputs: {},
      outputs: {},
      files: { wasm: "circuit.wasm", zkey: "circuit_final.zkey", vkey: "verification_key.json" },
    },
  } satisfies BundleFiles;

  it("resolves an explicit version via getVersion", async () => {
    const reg = fakeContract({
      getVersion: (name: unknown, version: unknown) => {
        expect(name).toBe("alpha");
        expect(version).toBe("0.1.0");
        return {
          rootHash: "0xabc",
          vkeyHash: "0xdef",
          verifier: "0x0",
          publisher: "0x0",
          publishedAt: 1n,
          metadataURI: "",
        };
      },
    });
    const fetcher = vi.fn(async (rh: string) => {
      expect(rh).toBe("0xabc");
      return fakeBundle;
    });
    const out = await resolveBundle(reg, { name: "alpha", version: "0.1.0" }, fetcher);
    expect(out.record.name).toBe("alpha");
    expect(out.record.version).toBe("0.1.0");
    expect(out.record.rootHash).toBe("0xabc");
    expect(out.bundle).toBe(fakeBundle);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("falls back to getLatest when version is omitted", async () => {
    const reg = fakeContract({
      getLatest: () => [
        "0.9.0",
        {
          rootHash: "0xLAT",
          vkeyHash: "0x0",
          verifier: "0x0",
          publisher: "0x0",
          publishedAt: 5n,
          metadataURI: "",
        },
      ],
    });
    const out = await resolveBundle(reg, { name: "alpha" }, async () => fakeBundle);
    expect(out.record.version).toBe("0.9.0");
    expect(out.record.rootHash).toBe("0xLAT");
  });
});

describe("onchain / utility", () => {
  it("parseNameSpec splits on first @", () => {
    expect(parseNameSpec("alpha@0.1.0")).toEqual({ name: "alpha", version: "0.1.0" });
    expect(parseNameSpec("alpha")).toEqual({ name: "alpha" });
    // weird-but-survivable: extra @ in version
    expect(parseNameSpec("alpha@0.1.0@beta")).toEqual({ name: "alpha", version: "0.1.0@beta" });
  });

  it("REGISTRY_ADDRESSES exposes both 0G chains", () => {
    expect(Object.keys(REGISTRY_ADDRESSES).map(Number).sort()).toEqual([16602, 16661]);
  });

  it("getRegistryAddress returns the configured address or null", () => {
    // Mainnet (16661) is the default deployment and must always be set.
    const mainnet = getRegistryAddress(16661);
    expect(mainnet).toMatch(/^0x[0-9a-fA-F]{40}$/);
    // Galileo (16602) is the optional testnet — set today, may be null in
    // the future. Just assert it parses if present.
    const galileo = getRegistryAddress(16602);
    if (galileo !== null) {
      expect(galileo).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
    expect(getRegistryAddress(99999)).toBeNull();
  });
});
