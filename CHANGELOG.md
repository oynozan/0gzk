# Changelog

All notable changes to this project will be documented in this file. The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased — v0.3.3 (CLI only)

### Added

- **`0gzk config` subcommand** with persistent settings stored in `~/.0gzk/config.json` (mode `0600`, atomic write). Subcommands: `set`, `get [--show]`, `list`, `unset`, `path`. Allowed keys: `privateKey`, `network`, `rpcUrl`, `indexerUrl`, `registry`. Values are validated before being written (private key must be 32 bytes hex, registry must be 20 bytes hex, URLs must be http(s), network must be `testnet` or `mainnet`). The private key is masked in `config get` (e.g. `0xCe9f…64d`); pass `--show` to reveal. New env var `OGZK_CONFIG_DIR` overrides the config directory (default `~/.0gzk`).
- **`0gzk key <hex>`** top-level shortcut, equivalent to `0gzk config set privateKey <hex>`. Same validation, same masked output.
- New helpers in [`packages/cli/src/config-store.ts`](./packages/cli/src/config-store.ts) (`loadGlobalConfig`, `saveGlobalConfig`, `applyGlobalConfigToEnv`, `envWasSetByShell`, `validateConfigValue`, `maskPrivateKey`).

### Changed

- **CLI no longer reads `.env` files.** [`packages/cli/src/index.ts`](./packages/cli/src/index.ts) drops its `dotenv` import and instead loads `~/.0gzk/config.json` at startup, injecting each present key into `process.env` (via `applyGlobalConfigToEnv`) only if the matching env var is not already set. The SDK still reads `process.env`, so the change is transparent to it. The `dotenv` dependency is removed from [`packages/cli/package.json`](./packages/cli/package.json).
- Resolution priority for the CLI is now explicit: **CLI flag > shell env > `~/.0gzk/config.json` > built-in network preset.** Documented in [`docs/content/cli.mdx`](./docs/content/cli.mdx) and the package READMEs.
- `0gzk --version` and `-V` are short-circuited before commander parses argv. Commander 12 + `parseAsync` has a quirk where its built-in version handler hangs the event loop; the manual short-circuit avoids it.
- `@0gzk/cli` bumped to `0.3.3`. SDK is unchanged at `0.3.2`.

### Notes

- Programmatic SDK consumers (Node apps, Next.js API routes, the `examples/` projects, the `web/` app) still load `OG_*` env vars normally — `.env` is only dropped from the CLI binary itself. The repo-level [`.env.example`](./.env.example) is updated to make this distinction explicit.

---

## Unreleased — v0.3.2

### Fixed

- **`0gzk publish` now correctly emits the bundle's content-addressed `rootHash` before the upload tx is submitted.** The `0.3.1` tarball published to npm shipped without this fix even though the source was patched, so users would still see `Upload did not start within 5m (no rootHash yet)` whenever the 0G Storage RPC was slow. `packages/sdk/src/node/storage.ts` now captures `tree.rootHash()` from the local Merkle computation immediately after `ZgFile.fromFilePath` and threads it into the `submitting` progress event and `tracker.rootHash`, so `UploadTimeoutError.rootHash` is always populated and `0gzk publish --register` can fall through to on-chain registration in a single command.
- `@0gzk/sdk` and `@0gzk/cli` bumped to `0.3.2`. `@0gzk/cli` now depends on `@0gzk/sdk@^0.3.2`.

## Unreleased — v0.3.0

**BREAKING:** Default network is now `mainnet` (chain id 16661). Programmatic callers that relied on the implicit Galileo default must now pass `network: "testnet"` (SDK), `--network testnet` (CLI), or set `OG_NETWORK=testnet`. Galileo testnet remains fully supported.

### Added

- `CircuitRegistry` deployed to **0G mainnet** at [`0xCe9f0DF51abeC7B8cD751067c6D8d3db5E2bE64d`](https://chainscan.0g.ai/address/0xCe9f0DF51abeC7B8cD751067c6D8d3db5E2bE64d). Baked into [`packages/contracts/registry-addresses.json`](./packages/contracts/registry-addresses.json) and [`packages/sdk/src/onchain/addresses.ts`](./packages/sdk/src/onchain/addresses.ts) so the SDK and CLI resolve it without configuration.
- [`web/lib/explorer.ts`](./web/lib/explorer.ts): `getExplorerBase()` reads `NEXT_PUBLIC_OG_EXPLORER` / `NEXT_PUBLIC_OG_NETWORK` and picks the correct chainscan host. `BundleHeader` now uses it instead of hardcoded `chainscan-galileo.0g.ai` URLs.

### Changed

- [`packages/sdk/src/node/config.ts`](./packages/sdk/src/node/config.ts): `loadConfig` defaults `network` to `mainnet` when `OG_NETWORK` is unset.
- [`packages/sdk/src/onchain/index.ts`](./packages/sdk/src/onchain/index.ts): `getRegistryContract`'s `chainId` parameter defaults to `16661` (was `16602`).
- [`web/lib/server/registry.ts`](./web/lib/server/registry.ts): server-side defaults flipped to mainnet RPC + chain id `16661`.
- [`web/components/StatusLine.tsx`](./web/components/StatusLine.tsx) is now a typed client component that takes `{network, indexer, build}` props instead of hardcoded `TESTNET` / `indexer-storage-testnet-turbo` literals. [`web/app/layout.tsx`](./web/app/layout.tsx) resolves the values once on the server with `loadConfig` and passes them down.
- [`web/app/whitepaper/page.tsx`](./web/app/whitepaper/page.tsx): rebumped to `v0.3.0`, points at the mainnet registry, and adds a one-line testnet footnote so the Galileo deployment isn't lost.
- [`packages/contracts/script/Deploy.s.sol`](./packages/contracts/script/Deploy.s.sol) JSDoc retargeted: mainnet first, Galileo as the alternative. `package.json` lists `deploy:mainnet` ahead of `deploy:galileo`.
- [`.env.example`](./.env.example) leads with `OG_NETWORK=mainnet`; the testnet block is shown as a commented alternative.
- All package READMEs and `packages/sdk/USAGE.md` rewritten so mainnet is the documented default and Galileo is the opt-in alternative.
- `@0gzk/sdk` and `@0gzk/cli` bumped to `0.3.0`. `@0gzk/cli` now depends on `@0gzk/sdk@^0.3.0`. (No `pnpm publish` in this commit.)

### Notes

- The Galileo testnet `CircuitRegistry` at [`0x5b2c3e86c9255a4459199a6d9cb7b63e2a660ce6`](https://chainscan-galileo.0g.ai/address/0x5b2c3e86c9255a4459199a6d9cb7b63e2a660ce6) is unchanged and reachable via `OG_NETWORK=testnet`.

---

## Unreleased — pre-0.3.0

### Added

- `@0gzk/sdk/build` subpath: Node-only helper that turns a pre-compiled circom artifact pair (`.r1cs` + `.wasm`) plus a `metadata.json` into a publishable bundle without going through `npx snarkjs`. Headline export `buildCircuitBundle` chains all of: Powers of Tau download (cached at `~/.cache/0gzk/ptau`, BLAKE2b-512 integrity checked against an embedded ceremony table), `groth16 setup`, `zkey contribute` with random entropy, `verification_key.json` + `verifier.sol` export, and bundle assembly — emitting structured `BuildProgress` events. Smaller primitives (`fetchPowersOfTau`, `setupGroth16`, `assembleBundle`, `hashVkey`, `canonicalJSON`) are exported individually. Pure JS (no `child_process`); circom remains the caller's concern. New `examples/05-publish-your-own/build.mjs` shows it driving an end-to-end build alongside the existing `build.sh`. Documented in [`packages/sdk/USAGE.md`](./packages/sdk/USAGE.md) §7. _Requires `@0gzk/sdk@^0.2.1` on npm — example 05 pins this and will install once the next sdk release ships._
- `examples/` folder with five standalone, copy-pasteable reference projects, each depending on `@0gzk/sdk` from npm (so they double as a release smoke test of the published tarballs):
  - [`01-prove-in-node`](./examples/01-prove-in-node) — resolve a circuit by name from the on-chain registry, fetch its bundle from 0G Storage, prove + verify in Node.
  - [`02-prove-in-browser`](./examples/02-prove-in-browser) — Vite + vanilla TS, gunzip + untar in-browser, snarkjs in WASM; witness never leaves the tab. Dev proxy works around the indexer's missing CORS headers.
  - [`03-verify-on-chain`](./examples/03-verify-on-chain) — Foundry project with hermetic `forge test` (mock verifier) plus a `SubmitProof.s.sol` recipe for the live-network path. Includes a `build-calldata.mjs` bridge from `snarkjs` proof JSON to Solidity calldata.
  - [`04-resolve-by-name`](./examples/04-resolve-by-name) — 25-line "phone book": print every field of a registry record + explorer URL.
  - [`05-publish-your-own`](./examples/05-publish-your-own) — `private_multiply.circom` (smallest meaningful privacy circuit) + a self-contained `build.sh` + a prose walkthrough from cold start through `0gzk publish --register`.
- GitHub Actions: two new jobs covering the examples — `examples-node` runs `pnpm smoke` for 01 + 04 against live Galileo testnet, `examples-forge` runs the hermetic `forge test` for 03.

### Changed

- Root `.npmrc` now sets `link-workspace-packages=true` explicitly. Default-on for pnpm 9, but spelling it out lets us drop `workspace:^` from published manifests while still symlinking workspace siblings during dev.

## 0.2.1 - 2026-05-12 (@0gzk/cli only)

### Fixed

- `@0gzk/cli@0.2.0` shipped with `"@0gzk/sdk": "workspace:^"` left in the published `package.json`, making `npm install @0gzk/cli@0.2.0` fail outside of the source monorepo (pnpm reports `ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`, npm fails to resolve). [`packages/cli/package.json`](./packages/cli/package.json) now declares `"@0gzk/sdk": "^0.2.0"` directly so the published manifest is correct regardless of which publisher tool is used. Dev symlinking still works via pnpm's `link-workspace-packages` (now pinned in `.npmrc`). `@0gzk/sdk@0.2.0` is unaffected and stays on npm as-is.

## 0.2.0 - 2026-05-12

### Added

- On-chain `CircuitRegistry` contract (`packages/contracts/src/CircuitRegistry.sol`) that maps `(name, version)` to `{rootHash, vkeyHash, verifier, publisher, publishedAt, metadataURI}`. Foundry test suite + Galileo deploy script. `IGroth16Verifier.sol` interface for typed consumer calls.
- `@0gzk/sdk/onchain` subpath: typed registry ABI + read helpers (`getRegistryContract`, `getVersion`, `listCircuits`, `resolveBundle`).
- `@0gzk/sdk` input validator now supports `field` type and array suffixes (`uint[]`, `field[]`) with optional `length` constraints. Backward compatible with existing `uint`/`bool` schemas.
- Vitest test suite for `@0gzk/sdk`: unit (`tests/unit/`), integration with a fixture bundle (`tests/integration/`), and live e2e gated on `OG_PRIVATE_KEY` (`tests/e2e/`).
- `packages/sdk/USAGE.md` — cookbook with browser, Next.js, Node, registry, and CI recipes.
- New reference circuits: `poseidon_preimage`, `merkle_membership` (depth 8), `private_balance_threshold`. Each ships `.circom`, `metadata.json`, `example_input.json`, `build.sh`.
- `circuits/_lib/build_lib.sh` — shared circuit build helper. Per-circuit `build.sh` is now a thin wrapper.
- CLI: `0gzk publish --register`, `0gzk registry list/get/resolve`, `0gzk prove --name <name>@<version>`.
- CLI `0gzk publish` is now resilient to slow 0G Storage finalization:
  - `--wait <duration>` (default `5m`) sets a wall-clock budget; accepts `30s`, `5m`, `2h`, `forever`, etc.
  - `--no-wait` returns as soon as the `rootHash` is on chain (short ~30s submit budget). `--register` still fires using that rootHash.
  - The `rootHash` is printed the moment the SDK learns it, even if a later step times out — so a stuck upload always leaves recovery info on screen.
  - A timeout exits with code `2` and prints next-step commands (`--wait 30m`, `0gzk registry register …`, `0gzk fetch …`).
- SDK: `uploadBundle` accepts a third `options` argument (`{ timeoutMs, onProgress }`). On timeout it throws `UploadTimeoutError` with `rootHash`/`lastProgress`. New types `UploadOptions`, `UploadProgress`, `UploadStage` are re-exported from `@0gzk/sdk/node`.
- CLI: new `0gzk registry register <rootHash> --bundle <dir>` recovers from a stalled finalization: re-reads the local bundle for `(name, version, vkeyHash)` and calls `publishVersion` on the supplied `rootHash` without re-uploading.
- Web app `/circuits` browse page; `/prove` and `/inspect` accept `?name=<name>@<version>`.
- Web app marketplace surface:
  - `/` is now a real engineering-spec landing page (purpose · workflow · latest circuits · use it) instead of redirecting to `/prove`.
  - `/circuits/[name]` detail page: all versions for a circuit with publisher, publish timestamp, rootHash/vkeyHash/verifier (explorer-linked), version switcher via `?version=`, and `INSPECT` / `PROVE` CTAs.
  - Client-side filter on `/circuits` matches against name, version, or owner.
  - Header wordmark now points at `/`; primary nav reordered to lead with CIRCUITS.
- Web app brought into the pnpm workspace (`@0gzk/sdk` now a workspace symlink instead of a hand-copied tree), eliminating the missing-peer-dep dev breakage.
- GitHub Actions CI: install, build, Vitest (sans e2e), and `forge fmt/build/test` on Node 20.
- `TODO.md` roadmap doc tracking v0.2 milestones and v0.3+ backlog.

## 0.1.0 - 2026-04-26

### Added

- `@0gzk/sdk` — initial publishable SDK with two surfaces:
  - **Isomorphic** (`@0gzk/sdk`): `generateProof`, `verifyLocal`, `validateInputs`, `InputValidationError`, and circuit/bundle types. Wraps `snarkjs.groth16` with metadata-driven input validation.
  - **Node-only** (`@0gzk/sdk/node`): `uploadBundle`/`fetchBundle` against 0G Storage via `@0gfoundation/0g-ts-sdk`, plus `loadConfig`, `readBundleFromDir`, and the network preset table.
- `@0gzk/cli` — the `0gzk` binary with `publish`, `fetch`, and `prove` commands. Bundle disk cache at `~/.0gzk/bundles/<rootHash>/`, override via `OGZK_CACHE_DIR`.
- Reference circuit `age_verification` plus a one-shot `build.sh` that handles `circom` compilation, Powers of Tau download with integrity check, `snarkjs` trusted setup, and tarball-friendly bundle layout.
- README entries for SDK and CLI; MIT LICENSE.

### Changed

- Renamed CLI binary and identifier from `zkpipe` to `0gzk`. Cache env var renamed `ZKPIPE_CACHE_DIR` -> `OGZK_CACHE_DIR`. Cache dir on disk renamed `~/.zkpipe/bundles` -> `~/.0gzk/bundles`.
- Internal package `@0gzk/core` extracted/renamed to publishable `@0gzk/sdk` and split into isomorphic + Node-only surfaces.
- `snarkjs`, `@0gfoundation/0g-ts-sdk`, and `ethers` are now `peerDependencies` of `@0gzk/sdk` (latter two optional). The CLI carries them as direct dependencies so `npm i -g @0gzk/cli` is one command.
