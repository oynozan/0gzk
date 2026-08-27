import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { readR1csCounts } from "../src/catalog/r1cs.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const ageR1cs = path.join(repoRoot, "circuits", "age_verification", "build", "age_verification.r1cs");

describe.skipIf(!existsSync(ageR1cs))("readR1csCounts against a real r1cs", () => {
  it("reads plausible counts from age_verification.r1cs", async () => {
    const counts = await readR1csCounts(ageR1cs);
    // age_verification is a tiny comparison circuit.
    expect(counts.mConstraints).toBeGreaterThan(0);
    expect(counts.mConstraints).toBeLessThan(10_000_000);
    expect(counts.mConstraints).toBeLessThan(100); // it is genuinely tiny
    // metadata declares two public inputs: currentYear, minAge.
    expect(counts.nPubIn).toBe(2);
    expect(counts.nPubOut + counts.nPubIn + counts.nPrvIn).toBeGreaterThan(0);
  });

  it("rejects a non-r1cs file", async () => {
    const notR1cs = path.join(repoRoot, "circuits", "age_verification", "metadata.json");
    await expect(readR1csCounts(notR1cs)).rejects.toThrow(/bad magic/);
  });
});
