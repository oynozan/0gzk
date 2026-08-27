# 02 - Prove in browser

A single-page Vite + vanilla-TS app that works for **any** 0gzk circuit:

1. Resolves `<name>@<version>` from `CircuitRegistry` on Galileo (via
   `ethers` + JSON-RPC, in-browser).
2. Fetches the bundle `.tar.gz` straight from 0G Storage via the Vite dev
   proxy (see below).
3. Decompresses + untars the bundle in the browser using
   [`fflate`](https://github.com/101arrowz/fflate) and a tiny POSIX-TAR
   reader.
4. **Renders an input form straight from `bundle.metadata.inputs`** — no
   per-circuit code edits needed. Each input row picks a widget from its
   declared `type` (`uint`, `field`, `bool`, `uint[]`, `field[]`).
5. Calls `@0gzk/sdk` to generate a Groth16 proof with snarkjs in WASM.
6. Verifies locally and surfaces results with the public signals labelled
   by their metadata name.

The witness never leaves the browser tab.

## Run it

```bash
pnpm install --frozen-lockfile --ignore-workspace
pnpm dev
```

Open `http://localhost:5173`. The page comes up in two steps:

1. **Pick a circuit** — type a name (e.g. `age_verification`) or click one
   of the four reference-circuit shortcuts. Click LOAD SCHEMA. The example
   resolves the latest version on Galileo, downloads the bundle, untars it,
   and renders one form row per declared input.
2. **Fill in inputs and prove** — for the four reference circuits the form
   is pre-filled with valid example values from each circuit's
   [`example_input.json`](../../circuits) so it works end-to-end on click.
   For other circuits, fill in your own values and submit.

Sample log for `age_verification` with the defaults:

```
[1/2] Resolving age_verification on Galileo...
      version=0.1.0 rootHash=0x56a3a18f4c... (~500 ms)
[2/2] Downloading bundle from 0G Storage + untarring...
      6912 B wasm + 1064064 B zkey (~3000 ms)

[1/2] Generating Groth16 proof in this browser tab...
      done (~1500 ms)
[2/2] Verifying locally...
      verified=true (~200 ms)

=== proof validity ===
proof is VALID (cryptographic check only)

=== public signals (by metadata name) ===
  isAdult        = 1     (output)
  currentYear    = 2026  (public-input)
  minAge         = 18    (public-input)

=== dApp gate verdict (age_verification) ===
PASS - a real gate (e.g. AgeGate.sol) would accept this proof:
  verifyProof(...) -> true
  pubSignals[isAdult] == 1
```

### Click-through demos

The four published reference circuits each ship with valid defaults so PROVE
works on first click:

| Circuit | What it proves | Notes |
| --- | --- | --- |
| `age_verification` | `currentYear - birthYear >= minAge` | Sole circuit with a non-trivial output. Verdict block included. |
| `poseidon_preimage` | `Poseidon([preimage]) == hash` | Default `preimage = 1`; matching `hash` is precomputed. |
| `merkle_membership` | A private `leaf` is in a Merkle tree of public `root` | Default leaf at index 5 of an 8-deep tree. |
| `private_balance_threshold` | Private `balance >= threshold`, anchored to `Poseidon([balance, salt])` | Default balance `1_000_000` ≥ threshold `100_000`. |

For circuits **not** in this defaults table the form still renders, but you
have to supply matching values yourself. In particular, any public input
that is the Poseidon hash of a private input (`hash`, `commitment`, Merkle
`root`) needs to be precomputed - this example deliberately doesn't ship a
Poseidon implementation. The repo has per-circuit
`derive_input.mjs` scripts in [`circuits/`](../../circuits) you can lift.

### Two checks, not one

`verifyLocal` answers a **cryptographic** question: "is this proof internally
consistent with this verification key?" That's necessary, not sufficient.
The **policy** question - "does the statement this proof attests to actually
mean I should grant access?" - is the dApp's job.

Try birthYear `2022` with the defaults: you'll see `verified: true` (the
proof is sound) but `isAdult = 0` (the prover is, in 2026, 4 years old).
A real gate would reject. See
[`../03-verify-on-chain/src/AgeGate.sol`](../03-verify-on-chain/src/AgeGate.sol)
for the canonical two-step pattern:

```solidity
if (!VERIFIER.verifyProof(...)) revert ProofRejected();
if (pubSignals[IS_ADULT_INDEX] != 1) revert NotAnAdult();
```

## About that proxy

The 0G Storage testnet indexer (`https://indexer-storage-testnet-turbo.0g.ai`)
does not currently send CORS headers, so a browser page can't fetch from it
cross-origin. We work around this in **dev** by proxying through Vite:

```ts
// vite.config.ts
server: {
  proxy: {
    "/0g-storage": {
      target: "https://indexer-storage-testnet-turbo.0g.ai",
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/0g-storage/, ""),
    },
  },
},
```

The browser still does the actual `fetch()`, the bundle bytes flow straight
through, and the witness never touches a server. The proxy just rewrites the
origin so CORS doesn't apply.

For **production**, deploy a thin proxy of your own (a Cloudflare Worker, a
Next.js route, anything that re-emits `Access-Control-Allow-Origin`). When 0G
ships CORS headers on the indexer itself the proxy step disappears entirely.

## What you need vs what we provide

| Step | Comes from |
| --- | --- |
| Registry read (ethers `Contract` + ABI) | [`@0gzk/sdk/onchain`](https://www.npmjs.com/package/@0gzk/sdk) |
| 0G Storage HTTP fetch | `fetch()` straight to `/file?root=<hash>` |
| gunzip + untar | [`fflate`](https://github.com/101arrowz/fflate) + [`src/tar.ts`](./src/tar.ts) (~30 LOC) |
| Schema-driven form rendering | This example's [`renderInputFields`](./src/main.ts) (~50 LOC); no framework. |
| Input validation against the schema | [`@0gzk/sdk`](https://www.npmjs.com/package/@0gzk/sdk) — `generateProof` calls `validateInputs` internally and throws `InputValidationError` with a per-input `issues` array we render as bullets. |
| Witness gen, proof, verify | [`@0gzk/sdk`](https://www.npmjs.com/package/@0gzk/sdk) + `snarkjs` (peer dep) |

If you replace the proxy with your own bundle fetcher (e.g. you've cached
the `.tar.gz` to your own S3), the rest of the file is unchanged - this is
the canonical "I have bundle bytes, prove with them" flow.

## Why not the Node SDK directly in the browser?

`@0gzk/sdk/node` (and the `@0gfoundation/0g-ts-sdk` it wraps) are
Node-targeted: they use `fs`, `tar`, and Node's `http`. The browser entry
point is `@0gzk/sdk` (no `/node`), which only exports the iso bits:
`generateProof`, `verifyLocal`, `validateInputs`. That's what this example
uses.

## Why a manual smoke?

Because we don't run browsers in CI. The example is small enough that a
manual sanity-check is fine: `pnpm dev`, hit PROVE, expect `verified: true`.
If you ever want a headless CI smoke, swap in Playwright.
