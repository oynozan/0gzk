import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { generateCatalog, serializeCatalog } from "../src/catalog/generate.js";
import { CatalogEntrySchema, CatalogSchema } from "../src/catalog/types.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("generateCatalog over the real circuits/ tree", () => {
  it("finds all 14 circuits, zod-valid, with tags and example inputs", async () => {
    const catalog = await generateCatalog({ repoRoot });

    expect(CatalogSchema.safeParse(catalog).success).toBe(true);
    expect(catalog.schemaVersion).toBe(1);
    expect(catalog.circuits).toHaveLength(14);

    for (const entry of catalog.circuits) {
      const parsed = CatalogEntrySchema.safeParse(entry);
      expect(parsed.success, `${entry.name}: ${JSON.stringify(parsed.success ? "" : parsed.error.issues)}`).toBe(true);
      expect(entry.tags.length, `${entry.name} has no tags`).toBeGreaterThanOrEqual(1);
      expect(entry.exampleInput, `${entry.name} has no exampleInput`).not.toBeNull();
      expect(entry.dir).toBe(`circuits/${entry.name}`);
    }

    // Sorted by name.
    const names = catalog.circuits.map((c) => c.name);
    expect(names).toEqual([...names].sort());
  });

  it("is deterministic: two runs serialize byte-identically", async () => {
    const [first, second] = await Promise.all([
      generateCatalog({ repoRoot }),
      generateCatalog({ repoRoot }),
    ]);
    expect(serializeCatalog(first)).toBe(serializeCatalog(second));
    // No timestamps anywhere in the output.
    expect(serializeCatalog(first)).not.toMatch(/generatedAt|timestamp/i);
  });

  it("merges publications.json records for age_verification", async () => {
    const catalog = await generateCatalog({ repoRoot });
    const age = catalog.circuits.find((c) => c.name === "age_verification");
    expect(age).toBeDefined();
    expect(age!.publications.length).toBeGreaterThanOrEqual(2);
    const chains = age!.publications.map((p) => p.chain);
    expect(chains).toContain("0g-mainnet");
    expect(chains).toContain("0g-testnet");
    for (const pub of age!.publications) {
      expect(pub.rootHash).toMatch(/^0x[0-9a-f]{64}$/i);
    }
  });
});
