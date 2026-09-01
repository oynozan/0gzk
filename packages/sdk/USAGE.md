# `@0gzk/sdk` usage guide

Copy-pasteable recipes for every place you'd want to prove a circuit. The SDK ships three subpaths, picked automatically by your runtime:

| Import                | Runtime         | What you get                                                                                                          |
| --------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------- |
| `@0gzk/sdk`           | Node + browser  | `generateProof`, `verifyLocal`, `validateInputs`, `BundleFiles`, `CircuitMetadata`, `InputValidationError`            |
| `@0gzk/sdk/node`      | Node-only       | `uploadBundle`, `fetchBundle`, `loadConfig`, `readBundleFromDir` (talks to 0G Storage via `@0gfoundation/0g-ts-sdk`)  |
| `@0gzk/sdk/onchain`   | Node + browser  | `getRegistryContract`, `getVersion`, `getLatest`, `listCircuits`, `resolveBundle`, `parseNameSpec`, ABI + addresses    |
| `@0gzk/sdk/build`     | Node-only       | `buildCircuitBundle` end-to-end + primitives (`fetchPowersOfTau`, `setupGroth16`, `assembleBundle`, `hashVkey`)        |

`snarkjs` is a hard peer dependency. `@0gfoundation/0g-ts-sdk` and `ethers` are optional peers — only required if you import from `/node` or `/onchain` respectively.

Witness data never leaves the calling process. `generateProof` is a thin wrapper around `snarkjs.groth16.fullProve` plus metadata-driven validation; the only thing that crosses a boundary is `proof + publicSignals`.

---

## 1. Browser ESM (no bundler)

Pull a bundle from your own server (or a CDN) and prove against it directly. Works in any modern browser that supports top-level ESM.

```html
<script type="importmap">
  {
    "imports": {
      "@0gzk/sdk": "https://esm.sh/@0gzk/sdk@0.2.0",
      "snarkjs": "https://esm.sh/snarkjs@0.7.5"
    }
  }
</script>

<script type="module">
  import { generateProof, verifyLocal } from "@0gzk/sdk";

  const [wasm, zkey, vkey, metadata] = await Promise.all([
    fetch("/bundle/circuit.wasm").then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b)),
    fetch("/bundle/circuit_final.zkey").then((r) => r.arrayBuffer()).then((b) => new Uint8Array(b)),
    fetch("/bundle/verification_key.json").then((r) => r.json()),
    fetch("/bundle/metadata.json").then((r) => r.json()),
  ]);

  const bundle = { wasm, zkey, vkey, metadata };
  const inputs = { birthYear: 1990, currentYear: 2026, minAge: 18 };

  const { proof, publicSignals } = await generateProof(bundle, inputs);
  const ok = await verifyLocal(bundle, { proof, publicSignals });
  console.log({ ok, publicSignals });
</script>
```

The SDK never reads `process.env`, never opens sockets, and never touches `fs` from `@0gzk/sdk`. The browser bundle is `snarkjs` + a thin validation layer.

---

## 2. Next.js App Router

Two pieces:

**Server route** that pulls the bundle from 0G Storage (Node-only) and ships base64 bytes to the client.

```ts
// app/api/bundle/route.ts
import { NextResponse } from "next/server";
import { fetchBundle, loadConfig } from "@0gzk/sdk/node";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const rootHash = url.searchParams.get("rootHash");
  if (!rootHash) return NextResponse.json({ error: "rootHash required" }, { status: 400 });

  const bundle = await fetchBundle(rootHash, loadConfig({}), `/tmp/0gzk/${rootHash}`);
  return NextResponse.json({
    metadata: bundle.metadata,
    vkey: bundle.vkey,
    wasm: Buffer.from(bundle.wasm).toString("base64"),
    zkey: Buffer.from(bundle.zkey).toString("base64"),
  });
}
```

**Client page** that decodes base64 and proves. Imports only from the isomorphic surface.

```tsx
// app/prove/page.tsx
"use client";

import { generateProof, verifyLocal, validateInputs } from "@0gzk/sdk";

function base64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export default function ProvePage() {
  async function onProve() {
    const r = await fetch("/api/bundle?rootHash=0x5aa4e2...").then((r) => r.json());
    const bundle = {
      metadata: r.metadata,
      vkey: r.vkey,
      wasm: base64ToBytes(r.wasm),
      zkey: base64ToBytes(r.zkey),
    };
    const inputs = { birthYear: 1990, currentYear: 2026, minAge: 18 };
    validateInputs(inputs, bundle.metadata);
    const { proof, publicSignals } = await generateProof(bundle, inputs);
    const ok = await verifyLocal(bundle, { proof, publicSignals });
    console.log({ ok, publicSignals });
  }
  return <button onClick={onProve}>Prove</button>;
}
```

If you see `Module not found: fs` or `readline` from snarkjs while bundling, add a webpack fallback in `next.config.js`:

```js
config.resolve.fallback = { ...config.resolve.fallback, fs: false, readline: false };
```

---

## 3. Plain Node script

Pull from 0G Storage, prove, verify, exit.

```ts
import { fetchBundle, loadConfig } from "@0gzk/sdk/node";
import { generateProof, verifyLocal } from "@0gzk/sdk";

const config = loadConfig({});
const bundle = await fetchBundle(
  process.argv[2], // rootHash
  config,
  "/tmp/my-bundle",
);

const inputs = JSON.parse(process.argv[3] ?? "{}");
const { proof, publicSignals } = await generateProof(bundle, inputs);
const ok = await verifyLocal(bundle, { proof, publicSignals });
console.log(ok ? "VERIFIED" : "FAILED", publicSignals);

process.exit(ok ? 0 : 1);
```

`loadConfig` reads `OGZK_NETWORK` (legacy `OG_NETWORK`) — **defaulting to `base`**, with `base-sepolia`, `0g-mainnet` and `0g-testnet` as the other choices — plus `OGZK_RPC_URL`, `OG_INDEXER_URL`, `OGZK_STORAGE`, the `OGZK_IPFS_*` settings, and (for uploads) `OGZK_PRIVATE_KEY`. The storage backend follows the chain family: `ipfs` on Base, `0g` on 0G chains. Pass `{ network: "0g-mainnet" }`, `{ rpcUrl: "..." }` etc. to override programmatically. Use `dotenv` (or any other `.env` loader) yourself if you want — `loadConfig` does not call it.

---

## 4. Resolve a circuit by name from the on-chain registry

Use `@0gzk/sdk/onchain` to skip "what's the rootHash?" entirely. The CircuitRegistry contract — on Base (the default) or 0G Chain — stores `name@version → rootHash + vkeyHash + verifier` mappings; the SDK ships a typed wrapper.

```ts
import { JsonRpcProvider } from "ethers";
import {
  getRegistryContract,
  resolveBundle,
  parseNameSpec,
} from "@0gzk/sdk/onchain";
import { fetchBundle, loadConfig } from "@0gzk/sdk/node";
import { generateProof, verifyLocal } from "@0gzk/sdk";

const provider = new JsonRpcProvider("https://mainnet.base.org");
const registry = getRegistryContract(provider); // chainId defaults to 8453 (Base mainnet)
// On another chain, name it: getRegistryContract(provider, undefined, 16661)

const { record, bundle } = await resolveBundle(
  registry,
  parseNameSpec("age_verification@0.1.0"), // or { name: "age_verification" } for latest
  (rootHash) => fetchBundle(rootHash, loadConfig({}), `/tmp/0gzk/${rootHash}`),
);

console.log(`Resolved ${record.name}@${record.version} → ${record.rootHash}`);

const inputs = { birthYear: 1990, currentYear: 2026, minAge: 18 };
const { proof, publicSignals } = await generateProof(bundle, inputs);
const ok = await verifyLocal(bundle, { proof, publicSignals });
```

In the browser, swap `fetchBundle` for a fetch shim that calls a Next.js / Express route which re-exports `fetchBundle` server-side.

You can also list and inspect:

```ts
import { listCircuits, getVersion, listVersions } from "@0gzk/sdk/onchain";

const all = await listCircuits(registry, { offset: 0, limit: 50 });
// [{ name, owner, versionCount, latestVersion }, ...]

const versions = await listVersions(registry, "age_verification");
const v = await getVersion(registry, "age_verification", versions[0]);
// { rootHash, vkeyHash, verifier, publisher, publishedAt, metadataURI }
```

If the registry hasn't been deployed to your chain yet, pass an explicit address: `getRegistryContract(provider, "0xYourDeployment", chainId)`.

---

## 5. CI / programmatic CLI usage

The CLI shells out to the same SDK code paths, so anything the CLI does, you can script. For full automation prefer the SDK directly — it's faster and lets you keep state in memory:

```ts
// scripts/prove-and-pin.ts
import { fetchBundle, loadConfig } from "@0gzk/sdk/node";
import { generateProof, verifyLocal } from "@0gzk/sdk";
import { promises as fs } from "node:fs";
import * as path from "node:path";

const ROOT = process.env.ROOT_HASH!;
const inputs = JSON.parse(await fs.readFile(process.env.INPUT!, "utf8"));

const cacheDir = path.join(process.env.RUNNER_TEMP ?? "/tmp", `bundle-${ROOT}`);
const bundle = await fetchBundle(ROOT, loadConfig({}), cacheDir);
const { proof, publicSignals } = await generateProof(bundle, inputs);
const ok = await verifyLocal(bundle, { proof, publicSignals });

if (!ok) {
  console.error("proof failed local verification");
  process.exit(1);
}

const outDir = process.env.OUT_DIR ?? "./proof-out";
await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(path.join(outDir, "proof.json"), JSON.stringify(proof, null, 2));
await fs.writeFile(path.join(outDir, "public.json"), JSON.stringify(publicSignals, null, 2));
```

Reasonable knobs in CI:

- Cache `cacheDir` between runs — bundles are content-addressed, so a cache hit is byte-equivalent to a re-download.
- `OG_PRIVATE_KEY` is only needed for `uploadBundle` / `0gzk publish`. Reads (`fetchBundle`, `prove`) work without a wallet.
- Run `vitest run --exclude tests/e2e/**` to validate without touching the network. Live e2e tests under `tests/e2e/` are gated on `OG_PRIVATE_KEY` and skip when unset.

---

## 6. Uploading with progress + timeouts

`uploadBundle` is one promise but it's three phases: pack → submit on chain → finalize on storage nodes. Phase 3 is asynchronous and can take minutes. Hand the SDK a budget and a listener and you'll always know what's happening — and what to do if you run out of time.

```ts
import { uploadBundle, loadConfig, UploadTimeoutError } from "@0gzk/sdk/node";

const config = loadConfig({});
let rootHash: string | undefined;

try {
  const result = await uploadBundle("./bundle", config, {
    timeoutMs: 5 * 60_000, // 5 minutes; pass Infinity to disable
    onProgress(p) {
      if (p.rootHash && !rootHash) {
        rootHash = p.rootHash;
        console.log("rootHash on chain:", rootHash);
      }
      switch (p.stage) {
        case "packing":     return process.stdout.write("packing…\n");
        case "submitting":  return process.stdout.write("submitting tx…\n");
        case "streaming":   return process.stdout.write(`streamed ${p.uploadedSegments} segments\n`);
        case "finalizing":  return process.stdout.write(p.finalized ? "finalized!\n" : "awaiting quorum…\n");
        case "done":        return; // result will resolve right after
      }
    },
  });
  console.log("uploaded:", result);
} catch (err) {
  if (err instanceof UploadTimeoutError && err.rootHash) {
    // Data is already on chain; finalization is still in flight.
    // You can register it on the on-chain registry right now and verify later.
    console.warn("timed out, but rootHash already on chain:", err.rootHash);
  } else {
    throw err;
  }
}
```

Stages, in order: `packing` → `submitting` → `streaming` → `finalizing` → `done`. The `rootHash` field appears no later than the first `streaming` event. `UploadTimeoutError` exposes `timeoutMs`, `rootHash`, and `lastProgress`.

The CLI mirrors this surface:

```bash
0gzk publish ./bundle --wait 5m
0gzk publish ./bundle --no-wait --register     # don't block on finalization
0gzk publish ./bundle --wait forever           # never give up
# If a previous run timed out and you have the rootHash:
0gzk registry register 0xabc… --bundle ./bundle
```

---

## 7. Build a bundle from a `.circom` file

`@0gzk/sdk/build` mirrors steps 2-6 of [`examples/05-publish-your-own/build.sh`](../../examples/05-publish-your-own/build.sh) in pure JS. You compile the `.circom` yourself (circom has no JS bindings — `child_process.spawn("circom", ...)` is the canonical way) and hand the SDK the resulting `.r1cs` + `.wasm`. It downloads the right Powers of Tau file, integrity-checks it against the embedded BLAKE2b table, runs `groth16 setup` + `zkey contribute` with random entropy, exports the verification key and Solidity verifier, and lays everything out in a `circuit_bundle/` ready for `0gzk publish`.

```ts
import { spawn } from "node:child_process";
import { buildCircuitBundle } from "@0gzk/sdk/build";

await new Promise((resolve, reject) => {
  const c = spawn("circom", [
    "my_circuit.circom",
    "--r1cs", "--wasm", "--sym",
    "-o", "build",
  ], { stdio: "inherit" });
  c.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`circom: ${code}`))));
});

const result = await buildCircuitBundle({
  r1csPath:     "build/my_circuit.r1cs",
  wasmPath:     "build/my_circuit_js/my_circuit.wasm",
  metadataPath: "metadata.json",
  outputDir:    "circuit_bundle",
  ptauSize:     12,                   // 2^12 = 4096 constraints, see PTAU_BLAKE2B
  onProgress: (e) => console.log(`[${e.stage}] ${e.message}`),
});

console.log("vkeyHash:", result.vkeyHash);   // ready for publishVersion
console.log("bundle:", result.bundleDir);    // ready for `0gzk publish` or uploadBundle
```

Stages, in order: `fetching-ptau` → `setup` → `exporting-vkey` → `exporting-verifier` → `assembling` → `done`.

Defaults the SDK picks for you (all overridable via options):

- `ptauCacheDir`: `~/.cache/0gzk/ptau` (POSIX) or `%LOCALAPPDATA%\0gzk\ptau` (Windows).
- `entropy`: 32 random bytes from `crypto.randomBytes`. Pass a fixed string only for reproducible test fixtures.
- `contributionName`: `0gzk-sdk-bootstrap`. The name is embedded in the contributed zkey as a snarkjs comment.
- `workDir`: a fresh tmpdir, cleaned up on success. Pass an explicit dir if you want the intermediate `circuit_0000.zkey` etc. to stick around.

The smaller primitives are exported individually in case you want to swap a step:

```ts
import {
  fetchPowersOfTau,
  setupGroth16,
  assembleBundle,
  hashVkey,
} from "@0gzk/sdk/build";

const ptauPath = await fetchPowersOfTau(12);
const setup = await setupGroth16({ r1csPath, ptauPath, outDir: "build" });
const bundle = await assembleBundle({
  wasmPath, metadataPath,
  zkeyPath: setup.zkeyPath,
  vkeyPath: setup.vkeyPath,
  verifierSolPath: setup.verifierSolPath,
  outputDir: "circuit_bundle",
});
console.log(hashVkey(JSON.parse(await fs.readFile(setup.vkeyPath, "utf8"))));
```

A `PtauIntegrityError` is thrown when the cached or downloaded ptau doesn't match the BLAKE2b table — protects you from a hijacked CDN or a corrupted cache file. See [`examples/05-publish-your-own/build.mjs`](../../examples/05-publish-your-own/build.mjs) for a complete `.circom` → `circuit_bundle` script in ~50 LOC.

---

## 8. Input validation cheatsheet

`validateInputs` (and `generateProof`, which calls it) is the single source of truth for what inputs your circuit will accept. The contract is the bundle's `metadata.json`:

```jsonc
{
  "inputs": {
    "balance":   { "type": "uint",     "visibility": "private" },
    "salt":      { "type": "field",    "visibility": "private" },
    "threshold": { "type": "uint",     "visibility": "public"  },
    "pathElements": { "type": "uint[]", "length": 8, "visibility": "private" }
  }
}
```

| Type        | Accepts                                                               | Rejects (with `InputValidationError`)                                       |
| ----------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `uint`      | non-negative integer or numeric string fitting in a circuit field     | negatives, decimals, hex above the field, `null`, missing                   |
| `bool`      | `true` / `false` / `0` / `1` / `"0"` / `"1"`                          | other strings, `null`                                                       |
| `field`     | decimal/hex/bigint < bn128 prime                                       | values ≥ prime, malformed hex                                                |
| `uint[]`    | array of `uint`, length matches `length` if set                       | wrong length, non-array, bad elements                                       |
| `field[]`   | array of `field`, length matches `length` if set                      | wrong length, non-array, bad elements                                       |

Anything in `inputs` that isn't in `metadata.inputs` is rejected; anything missing is rejected. Errors come through as `InputValidationError` with an `errors: string[]` listing every problem in one shot, so users get one round-trip of feedback.

---

## See also

- [`packages/sdk/README.md`](./README.md) — quick API reference and `Install`.
- [Root `README.md`](../../README.md) — architecture overview, monorepo layout, network config.
- [`CHANGELOG.md`](../../CHANGELOG.md) — release notes per version.
