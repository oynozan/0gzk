import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig, requireSigningConfig } from "../../src/node/config.js";

const ENV_KEYS = [
  "OG_NETWORK",
  "OG_RPC_URL",
  "OG_INDEXER_URL",
  "OG_PRIVATE_KEY",
  "OGZK_NETWORK",
  "OGZK_RPC_URL",
  "OGZK_PRIVATE_KEY",
  "OGZK_STORAGE",
  "OGZK_STORAGE_NETWORK",
  "OGZK_IPFS_API_URL",
  "OGZK_IPFS_API_TOKEN",
  "OGZK_IPFS_GATEWAY",
];

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("loadConfig", () => {
  it("defaults to Base mainnet with the ipfs backend", () => {
    const config = loadConfig();
    expect(config.network).toBe("base");
    expect(config.chainId).toBe(8453);
    expect(config.rpcUrl).toBe("https://mainnet.base.org");
    expect(config.storage).toBe("ipfs");
    // Still resolvable for the 0G backend, but unused while storage is ipfs.
    expect(config.storageNetwork).toBe("0g-mainnet");
  });

  it("switches back to 0G on request", () => {
    const config = loadConfig({ network: "0g-mainnet" });
    expect(config.chainId).toBe(16661);
    expect(config.rpcUrl).toBe("https://evmrpc.0g.ai");
    expect(config.indexerUrl).toBe("https://indexer-storage-turbo.0g.ai");
    expect(config.storage).toBe("0g");
  });

  it("accepts deprecated aliases from OG_NETWORK", () => {
    process.env.OG_NETWORK = "testnet";
    const config = loadConfig();
    expect(config.network).toBe("0g-testnet");
    expect(config.chainId).toBe(16602);
    expect(config.rpcUrl).toBe("https://evmrpc-testnet.0g.ai");
  });

  it("OGZK_NETWORK wins over OG_NETWORK", () => {
    process.env.OG_NETWORK = "mainnet";
    process.env.OGZK_NETWORK = "base-sepolia";
    expect(loadConfig().network).toBe("base-sepolia");
  });

  it("throws on unknown network with the valid list", () => {
    process.env.OG_NETWORK = "polygon";
    expect(() => loadConfig()).toThrow(/Unknown network "polygon".*0g-mainnet/s);
  });

  it("base networks default to ipfs storage and 0g-mainnet storageNetwork", () => {
    const config = loadConfig({ network: "base" });
    expect(config.chainId).toBe(8453);
    expect(config.rpcUrl).toBe("https://mainnet.base.org");
    expect(config.storage).toBe("ipfs");
    expect(config.storageNetwork).toBe("0g-mainnet");
    // indexerUrl stays resolvable for backcompat even when storage is ipfs
    expect(config.indexerUrl).toBe("https://indexer-storage-turbo.0g.ai");
  });

  it("OGZK_STORAGE overrides the family default", () => {
    process.env.OGZK_STORAGE = "0g";
    const config = loadConfig({ network: "base-sepolia" });
    expect(config.storage).toBe("0g");
  });

  it("rejects a non-0g storageNetwork", () => {
    expect(() => loadConfig({ network: "base", storageNetwork: "base" as never })).toThrow(
      /storageNetwork must be a 0G chain/,
    );
  });

  it("reads ipfs settings from env with Pinata defaults", () => {
    process.env.OGZK_IPFS_API_TOKEN = "jwt";
    process.env.OGZK_IPFS_GATEWAY = "https://gw.example";
    const config = loadConfig({ network: "base" });
    expect(config.ipfs.apiUrl).toContain("pinata.cloud");
    expect(config.ipfs.apiToken).toBe("jwt");
    expect(config.ipfs.gateway).toBe("https://gw.example");
  });

  it("privateKey resolution prefers OGZK_PRIVATE_KEY over OG_PRIVATE_KEY", () => {
    process.env.OG_PRIVATE_KEY = "0xold";
    process.env.OGZK_PRIVATE_KEY = "0xnew";
    expect(loadConfig().privateKey).toBe("0xnew");
  });

  it("requireSigningConfig names both env vars in its error", () => {
    const config = loadConfig();
    expect(() => requireSigningConfig(config)).toThrow(/OGZK_PRIVATE_KEY.*OG_PRIVATE_KEY/s);
  });
});
