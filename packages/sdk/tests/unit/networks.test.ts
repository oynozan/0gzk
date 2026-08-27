import { describe, expect, it } from "vitest";

import {
  NETWORKS,
  NETWORK_NAMES,
  explorerAddressUrl,
  explorerTxUrl,
  networkForChainId,
  resolveNetwork,
} from "../../src/networks.js";

describe("networks", () => {
  it("exposes the four supported chains", () => {
    expect(NETWORK_NAMES.sort()).toEqual(["0g-mainnet", "0g-testnet", "base", "base-sepolia"]);
    expect(NETWORKS["0g-mainnet"].chainId).toBe(16661);
    expect(NETWORKS["0g-testnet"].chainId).toBe(16602);
    expect(NETWORKS.base.chainId).toBe(8453);
    expect(NETWORKS["base-sepolia"].chainId).toBe(84532);
  });

  it("every 0g-family chain carries an indexerUrl", () => {
    for (const name of NETWORK_NAMES) {
      const preset = NETWORKS[name];
      if (preset.family === "0g") {
        expect(preset.indexerUrl, `${name} missing indexerUrl`).toMatch(/^https:/);
      }
    }
  });

  it("resolveNetwork accepts canonical names and deprecated aliases", () => {
    expect(resolveNetwork("0g-mainnet")).toBe("0g-mainnet");
    expect(resolveNetwork("base-sepolia")).toBe("base-sepolia");
    expect(resolveNetwork("mainnet")).toBe("0g-mainnet");
    expect(resolveNetwork("testnet")).toBe("0g-testnet");
    expect(resolveNetwork("polygon")).toBeUndefined();
    expect(resolveNetwork(undefined)).toBeUndefined();
    expect(resolveNetwork("")).toBeUndefined();
  });

  it("networkForChainId maps ids back to names", () => {
    expect(networkForChainId(8453)).toBe("base");
    expect(networkForChainId(16661)).toBe("0g-mainnet");
    expect(networkForChainId(1)).toBeUndefined();
  });

  it("explorer URL helpers use /tx and /address defaults", () => {
    expect(explorerTxUrl(NETWORKS.base, "0xabc")).toBe("https://basescan.org/tx/0xabc");
    expect(explorerAddressUrl(NETWORKS["0g-testnet"], "0xdef")).toBe(
      "https://chainscan-galileo.0g.ai/address/0xdef",
    );
    expect(explorerTxUrl({ explorer: "https://x.y", explorerTxPath: "/t/{hash}" }, "0x1")).toBe(
      "https://x.y/t/0x1",
    );
  });
});
