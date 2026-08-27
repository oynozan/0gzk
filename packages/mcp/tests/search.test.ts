import path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

import { generateCatalog } from "../src/catalog/generate.js";
import { searchCatalog } from "../src/catalog/search.js";
import type { Catalog } from "../src/catalog/types.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

let catalog: Catalog;

beforeAll(async () => {
  catalog = await generateCatalog({ repoRoot });
});

describe("searchCatalog", () => {
  it('ranks age_verification first for "prove age over 18"', () => {
    const results = searchCatalog(catalog, "prove age over 18");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.entry.name).toBe("age_verification");
  });

  it('ranks merkle_membership first for "merkle tree membership"', () => {
    const results = searchCatalog(catalog, "merkle tree membership");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.entry.name).toBe("merkle_membership");
  });

  it('puts a sybil-resistance circuit in the top 3 for "sybil one person one vote"', () => {
    const results = searchCatalog(catalog, "sybil one person one vote");
    const topNames = results.slice(0, 3).map((r) => r.entry.name);
    expect(
      topNames.includes("unique_human_nullifier") || topNames.includes("anonymous_vote"),
      `top 3 was ${topNames.join(", ")}`,
    ).toBe(true);
  });

  it("returns [] for gibberish", () => {
    expect(searchCatalog(catalog, "xyzzy quux flarp")).toEqual([]);
  });

  it("reports matched fields and stable ordering", () => {
    const results = searchCatalog(catalog, "merkle");
    for (const match of results) {
      expect(match.score).toBeGreaterThan(0);
      expect(match.matchedFields.length).toBeGreaterThan(0);
    }
    const again = searchCatalog(catalog, "merkle");
    expect(again.map((r) => r.entry.name)).toEqual(results.map((r) => r.entry.name));
  });
});
