import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CONFIG_KEYS,
  CONFIG_TO_ENV,
  loadGlobalConfig,
  maskPrivateKey,
  saveGlobalConfig,
  validateConfigValue,
} from "../src/config-store.js";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "0gzk-config-test-"));
  process.env.OGZK_CONFIG_DIR = tmpDir;
});

afterEach(async () => {
  delete process.env.OGZK_CONFIG_DIR;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("validateConfigValue", () => {
  it("accepts canonical networks and aliases", () => {
    for (const v of ["0g-mainnet", "0g-testnet", "base", "base-sepolia", "mainnet", "testnet"]) {
      expect(() => validateConfigValue("network", v)).not.toThrow();
    }
  });

  it("rejects unknown networks with the valid list", () => {
    expect(() => validateConfigValue("network", "polygon")).toThrow(/0g-mainnet/);
  });

  it("storage must be 0g or ipfs", () => {
    expect(() => validateConfigValue("storage", "0g")).not.toThrow();
    expect(() => validateConfigValue("storage", "ipfs")).not.toThrow();
    expect(() => validateConfigValue("storage", "arweave")).toThrow(/0g.*ipfs/);
  });

  it("storageNetwork must be a 0G chain", () => {
    expect(() => validateConfigValue("storageNetwork", "0g-testnet")).not.toThrow();
    expect(() => validateConfigValue("storageNetwork", "base")).toThrow(/0g-mainnet/);
  });

  it("ipfs urls validated, tokens non-empty", () => {
    expect(() => validateConfigValue("ipfsGateway", "https://ipfs.io")).not.toThrow();
    expect(() => validateConfigValue("ipfsGateway", "not a url")).toThrow(/http/);
    expect(() => validateConfigValue("ipfsApiToken", "  ")).toThrow(/non-empty/);
    expect(() => validateConfigValue("anthropicApiKey", "sk-ant-xyz")).not.toThrow();
  });
});

describe("config store round-trip", () => {
  it("persists and reloads the new keys", async () => {
    await saveGlobalConfig({
      network: "base-sepolia",
      storage: "ipfs",
      ipfsApiToken: "jwt-token",
      anthropicApiKey: "sk-ant-abc123",
    });
    const cfg = await loadGlobalConfig();
    expect(cfg.network).toBe("base-sepolia");
    expect(cfg.storage).toBe("ipfs");
    expect(cfg.ipfsApiToken).toBe("jwt-token");
    expect(cfg.anthropicApiKey).toBe("sk-ant-abc123");
  });

  it("every config key maps to an env var", () => {
    for (const key of CONFIG_KEYS) {
      expect(CONFIG_TO_ENV[key], `missing env mapping for ${key}`).toMatch(/^[A-Z_]+$/);
    }
    expect(CONFIG_TO_ENV.anthropicApiKey).toBe("ANTHROPIC_API_KEY");
    expect(CONFIG_TO_ENV.ipfsApiToken).toBe("OGZK_IPFS_API_TOKEN");
  });
});

describe("maskPrivateKey", () => {
  it("masks long secrets to prefix…suffix", () => {
    expect(maskPrivateKey("sk-ant-api03-verylongsecretvalue")).toMatch(/^sk-ant…\w{4}$|^sk-ant.*…/);
    expect(maskPrivateKey(undefined)).toBeUndefined();
  });
});
