import { describe, expect, it } from "vitest";

import { generateProof, verifyLocal } from "../../src/prover.js";
import { fixtureAvailable, loadAgeVerificationBundle } from "../fixtures/bundle.js";

// Prebuilt fixture is gitignored (zkey is multi-MB). Tests gracefully skip
// when contributors haven't run `bash circuits/age_verification/build.sh` and
// copied circuit.wasm + circuit_final.zkey into
// packages/sdk/tests/fixtures/age_verification/.
const HAS_FIXTURE = await fixtureAvailable();

describe.skipIf(!HAS_FIXTURE)("generateProof + verifyLocal (age_verification fixture)", () => {
  it("produces a valid proof for a satisfying input", async () => {
    const bundle = await loadAgeVerificationBundle();
    const inputs = { birthYear: 1990, currentYear: 2026, minAge: 18 };

    const result = await generateProof(bundle, inputs);

    expect(result.proof).toBeDefined();
    expect(Array.isArray(result.publicSignals)).toBe(true);

    // Per the circuit: outputs come first, then public inputs in declaration order.
    // age_verification: [isAdult, currentYear, minAge]
    expect(result.publicSignals).toEqual(["1", "2026", "18"]);

    const ok = await verifyLocal(bundle, result);
    expect(ok).toBe(true);
  });

  it("yields isAdult=0 for an underage prover", async () => {
    const bundle = await loadAgeVerificationBundle();
    const result = await generateProof(bundle, {
      birthYear: 2020,
      currentYear: 2026,
      minAge: 18,
    });

    expect(result.publicSignals[0]).toBe("0");
    const ok = await verifyLocal(bundle, result);
    expect(ok).toBe(true);
  });

  it("rejects a tampered public signal", async () => {
    const bundle = await loadAgeVerificationBundle();
    const result = await generateProof(bundle, {
      birthYear: 1990,
      currentYear: 2026,
      minAge: 18,
    });

    const tampered = {
      ...result,
      publicSignals: [...result.publicSignals],
    };
    tampered.publicSignals[0] = tampered.publicSignals[0] === "1" ? "0" : "1";

    const ok = await verifyLocal(bundle, tampered);
    expect(ok).toBe(false);
  });

  it("propagates input validation errors before invoking snarkjs", async () => {
    const bundle = await loadAgeVerificationBundle();
    await expect(
      generateProof(bundle, { birthYear: -1, currentYear: 2026, minAge: 18 }),
    ).rejects.toThrowError(/Input validation failed/);
  });
});
