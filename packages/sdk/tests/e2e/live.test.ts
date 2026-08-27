import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { describe, it, expect } from "vitest";

import { generateProof, verifyLocal } from "../../src/prover.js";
import { fetchBundle, loadConfig, uploadBundle } from "../../src/node/index.js";
import { loadAgeVerificationBundle, FIXTURE_DIR } from "../fixtures/bundle.js";

// Live e2e against 0G Storage on the live network. Defaults to whatever
// OG_NETWORK points at — set OG_NETWORK=testnet to run against Galileo and
// avoid mainnet gas. Skipped when OG_PRIVATE_KEY is unset, so default
// `pnpm test` (which excludes tests/e2e/**) and CI both stay green without
// a wallet. Run explicitly with `pnpm test:e2e`.

const HAS_KEY = Boolean(process.env.OG_PRIVATE_KEY);
const describeIfKeyed = HAS_KEY ? describe : describe.skip;

describeIfKeyed("live 0G Storage round-trip", () => {
  it("uploads, fetches, and proves against the fetched bundle", { timeout: 180_000 }, async () => {
    const config = loadConfig();
    expect(config.privateKey).toBeDefined();

    // 1. upload a copy of the fixture bundle.
    const upload = await uploadBundle(FIXTURE_DIR, config);
    expect(upload.rootHash).toMatch(/^0x[0-9a-fA-F]{64}$/);
    expect(upload.txHash).toMatch(/^0x[0-9a-fA-F]{64}$/);

    // 2. fetch it back into a temp dir.
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "0gzk-e2e-"));
    try {
      const fetched = await fetchBundle(upload.rootHash, config, tmp);
      const fixture = await loadAgeVerificationBundle();

      expect(fetched.metadata.name).toBe(fixture.metadata.name);
      expect(fetched.wasm.byteLength).toBe(fixture.wasm.byteLength);
      expect(fetched.zkey.byteLength).toBe(fixture.zkey.byteLength);

      // 3. generate + verify a proof against the fetched copy.
      const { proof, publicSignals } = await generateProof(fetched, {
        birthYear: 1990,
        currentYear: 2026,
        minAge: 18,
      });
      expect(publicSignals).toEqual(["1", "2026", "18"]);

      const ok = await verifyLocal(fetched, { proof, publicSignals });
      expect(ok).toBe(true);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
    }
  });
});
