# 0gzk roadmap

Living checklist of what's planned, what's open, and what's deliberately deferred.
Each milestone is concrete enough to execute against; backlog items are sketches that
will be promoted into milestone scope as priorities settle.

---

## v0.2 — Registry, Circuits, Tests, Docs

The shipping milestone: turn 0gzk from "publish a bundle, prove it" into
"resolve a circuit by name on 0G Chain, hold it accountable to a vkey, prove
against it from any surface, with confidence backed by tests."

Code-complete on testnet, registry deployed at
[`0x5b2c3e86c9255a4459199a6d9cb7b63e2a660ce6`](https://chainscan-galileo.0g.ai/address/0x5b2c3e86c9255a4459199a6d9cb7b63e2a660ce6)
on Galileo. Outstanding work before tagging v0.2:

- [x] Deploy `CircuitRegistry` to Galileo and commit the address into [`packages/contracts/registry-addresses.json`](./packages/contracts/registry-addresses.json) and the SDK mirror at [`packages/sdk/src/onchain/addresses.ts`](./packages/sdk/src/onchain/addresses.ts).
- [x] Publish all four reference circuits to the testnet registry (`age_verification`, `poseidon_preimage`, `merkle_membership`, `private_balance_threshold`) so `0gzk registry list` returns something meaningful out of the box.
- [x] Publish the v0.2 SDK + CLI to npm — `@0gzk/sdk@0.2.0` and `@0gzk/cli@0.2.0` live, both tagged `latest`.

### Contracts

- [x] `CircuitRegistry.sol` with `(name, version) -> {rootHash, vkeyHash, verifier, publisher, publishedAt, metadataURI}`
- [x] `IGroth16Verifier.sol` interface for typed verifier calls
- [x] Foundry test suite: claim, publish, immutability, verifier swap, transfer, paging, name validation
- [x] `Deploy.s.sol` targeting Galileo (chain 16602) with `OG_PRIVATE_KEY`
- [x] `forge-std` installed via `forge install foundry-rs/forge-std`
- [x] Deployed registry address committed to `packages/contracts/registry-addresses.json`

### SDK

- [x] Input validator: `field` type, `uint[]`/`field[]` array support with optional `length`
- [x] `@0gzk/sdk/onchain` subpath: ABI export, `getRegistryContract`, `getVersion`, `listCircuits`, `resolveBundle`
- [x] Vitest unit tests for `inputs.ts` (every coercion + every error)
- [x] Vitest integration tests for `prover.ts` with a fixture bundle round-trip
- [x] Vitest integration tests for `onchain.ts` against a mocked registry
- [x] Live e2e suite gated on `OG_PRIVATE_KEY`, skipped in default CI
- [x] `packages/sdk/USAGE.md` with browser/Next.js/Node/registry/CI recipes
- [x] `packages/sdk/README.md` refresh with TL;DR pointing at `USAGE.md`

### Circuits

- [x] `circuits/_lib/build_lib.sh` extracted; `age_verification/build.sh` ported onto it
- [x] `circuits/poseidon_preimage/` — `Poseidon([x]) == h`, smallest privacy circuit
- [x] `circuits/merkle_membership/` — depth-8 Poseidon Merkle inclusion
- [x] `circuits/private_balance_threshold/` — `balance >= threshold` with public commitment

### CLI

- [x] `0gzk publish --register [--registry 0x...]` chains storage upload + on-chain register
- [x] `0gzk registry list / get / resolve` command group
- [x] `0gzk prove --name <name>@<version>` shortcut (resolve via registry then prove)
- [x] Publish resilience: structured `UploadProgress` events, `--wait <duration>` / `--no-wait` flags, `UploadTimeoutError` carrying the early rootHash, and `0gzk registry register <rootHash> --bundle <dir>` recovery subcommand

### Web

- [x] `/circuits` browse page (server-rendered, calls `listCircuits`)
- [x] `/prove` and `/inspect` accept `?name=<name>@<version>` alongside `?rootHash=0x...`
- [x] `/api/bundle` resolves `name@version` -> rootHash before fetch
- [x] Real engineering-spec landing page at `/` (purpose · workflow · latest circuits · use it)
- [x] `/circuits/[name]` per-circuit detail page with publisher/version history/explorer links
- [x] Client-side filter on `/circuits`
- [x] Brand: logo wired into header, favicon, OG/Twitter cards

### Repo plumbing

- [x] `CHANGELOG.md` v0.2 entry
- [x] `.github/workflows/ci.yml` — install + build + Vitest (excluding e2e) + `forge fmt/build/test` on Node 20

---

## v0.2.x — DX & examples

Out-of-band follow-ups that landed (or are landing) after v0.2 hit npm. Everything here was discovered by trying to use the published packages from scratch.

### Examples

- [x] [`examples/01-prove-in-node`](./examples/01-prove-in-node) — registry resolve + 0G Storage fetch + snarkjs prove in Node.
- [x] [`examples/02-prove-in-browser`](./examples/02-prove-in-browser) — Vite + vanilla TS, gunzip + untar client-side, full client-side proving.
- [x] [`examples/03-verify-on-chain`](./examples/03-verify-on-chain) — Foundry consumer with hermetic mock verifier + on-chain submission recipe.
- [x] [`examples/04-resolve-by-name`](./examples/04-resolve-by-name) — registry phone-book.
- [x] [`examples/05-publish-your-own`](./examples/05-publish-your-own) — `private_multiply.circom`, self-contained `build.sh`, prose walkthrough.
- [x] CI: `examples-node` (matrix 01 + 04 vs live Galileo) and `examples-forge` (hermetic forge test for 03).

### SDK build helper

- [x] `@0gzk/sdk/build` subpath: `buildCircuitBundle` + primitives (`fetchPowersOfTau`, `setupGroth16`, `assembleBundle`, `hashVkey`). Pure JS replacement for steps 2-6 of the per-circuit `build.sh`. Embedded BLAKE2b table for ptau integrity. Default OS-conventional cache dir (`~/.cache/0gzk/ptau` etc).
- [x] Unit tests in [`packages/sdk/tests/unit/build.test.ts`](./packages/sdk/tests/unit/build.test.ts) cover ptau cache hit/miss, hash mismatch, canonical JSON, and bundle layout.
- [x] [`examples/05-publish-your-own/build.mjs`](./examples/05-publish-your-own/build.mjs) — SDK-driven alternative to `build.sh`. README explains both paths side by side.
- [x] [`packages/sdk/USAGE.md`](./packages/sdk/USAGE.md) §7: cookbook entry for the new subpath, including the smaller primitives.

### Patch releases

- [x] `@0gzk/cli@0.2.1` — fix the published manifest: `"@0gzk/sdk": "workspace:^"` was left literal in 0.2.0 (`npm publish` was used instead of `pnpm publish`). Source now declares `"@0gzk/sdk": "^0.2.0"` directly. Root `.npmrc` pins `link-workspace-packages=true` so workspace dev still symlinks.
- [ ] Publish `@0gzk/cli@0.2.1` to npm.
- [ ] Publish `@0gzk/sdk@0.2.1` to npm so [`examples/05-publish-your-own`](./examples/05-publish-your-own) can `pnpm install` (it pins `@0gzk/sdk: ^0.2.1` for the new `build.mjs`). The bump itself is additive (new `/build` subpath); no breaking changes vs `0.2.0`.

---

## v0.3 backlog — Distributed trusted setup on 0G Compute

Use 0G Compute as the multi-party-computation venue for the phase-2 ceremony.
Today the contribution in [`circuits/age_verification/build.sh`](./circuits/age_verification/build.sh)
runs on whoever's machine the author is using. For larger circuits we want N
independent operators contributing without trusting any single one.

Sketch:

- New `0gzk ceremony start <circuit>` command schedules N jobs across N nodes.
- Each node pulls the previous `.zkey`, contributes, signs the contribution with its
  attestation key, returns the new `.zkey`.
- A coordinator collects the transcript, picks the final `.zkey`, and writes a
  `ceremony.json` next to the bundle proving M-of-N nodes contributed.
- `0gzk publish` records `ceremony.json` rootHash inside the registry's `metadataURI`.

Open questions:

- 0G Compute job scheduling primitives — is there a queue or do we manage liveness ourselves?
- Attestation format: TEE quote, BLS signature, or simple ECDSA on the contribution hash?
- Cost: how many contributors are economically viable per circuit?

---

## v0.4 backlog — Public-witness remote proving

For circuits that have **no `private` inputs at all** (Merkle inclusion of a
public address, on-chain state proofs, batch aggregation), client-side proving
is unnecessary. Offer remote proving as opt-in.

Sketch:

- New SDK runtime: `generateProof(bundle, inputs, { runtime: "0g-compute", endpoint, payment })`.
- The SDK refuses to run that path if any `metadata.inputs[*].visibility === "private"`.
  Refuse-to-call, not refuse-to-send: the schema check happens before any network I/O.
- 0G Compute job runs `snarkjs.fullProve` and returns `{proof, publicSignals, signedReceipt}`.
- Browser still calls `verifyLocal` before accepting.

Open questions:

- Receipt format for "this proof was generated by node X at time Y."
- Pricing: per-job fixed, per-constraint, or per-second?

---

## v0.5+ stretch — zkML hosting, TEE-attested proving

- **zkML alignment**: 0G Compute runs ML inference, EZKL/RISC0 wraps it as a ZK
  circuit, 0gzk hosts the verifier circuit. We become "where 0G Compute outputs
  become Ethereum-verifiable."
- **TEE-attested proving** (speculative, depends on 0G Compute exposing
  attestation): browser encrypts witness to enclave attestation key, enclave
  proves inside, plaintext witness never touches host memory. Restores privacy
  while letting heavy circuits offload.

Open questions:

- Does 0G Compute publish remote attestation quotes?
- Which zkML toolchains do we want to support first — EZKL, RISC0 zkVM, Noir?

---

## Open product questions (cross-cutting)

- **Mainnet timing.** v0.2 is testnet only. When do we deploy `CircuitRegistry`
  to mainnet? Probably blocked on a real audit pass.
- **`metadataURI` schema.** What goes in the human-readable marketplace
  metadata file? Tags, demo input, example dApps, license, audit links?
- **Naming policy.** First-come-first-serve, but what's the dispute mechanism
  if a squatter grabs `uniswap_v3_state_proof`?
- **Fee model.** Should the registry charge a small fee per `publishVersion`
  (e.g., to a treasury) or stay free during the testnet phase?
- **Verifier auto-deploy.** Should `0gzk publish --register` also deploy
  `verifier.sol` and call `setVerifier` in the same flow? Cleaner but
  requires more gas budgeting.
