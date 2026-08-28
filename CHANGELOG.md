# Changelog

All notable changes to this project will be documented in this file. The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased — v0.4.0

**BREAKING (types):** `UploadResult.txHash` and `UploadResult.txSeq` are now optional — they are 0G-only and absent on IPFS uploads. `UploadResult` gains required `uri` (`"0g://0x..."` | `"ipfs://Qm..."`) and `backend` (`"0g"` | `"ipfs"`) fields, plus optional `finalized`.

**BREAKING (behavior):** Unknown network names now **throw** (listing the valid values) instead of silently defaulting to mainnet. The deprecated aliases `mainnet` → `0g-mainnet` and `testnet` → `0g-testnet` keep working everywhere a network is read.

### Added

- **Multi-chain network model.** [`packages/sdk/src/networks.ts`](./packages/sdk/src/networks.ts) — a single isomorphic preset table shared by SDK, CLI, web, and examples, exported from the `@0gzk/sdk` root and re-exported from `/node`: `NETWORKS`, `resolveNetwork`, `networkForChainId`, `explorerTxUrl`, `explorerAddressUrl`. Canonical names: `0g-mainnet` (16661), `0g-testnet` (16602), `base` (8453), `base-sepolia` (84532); Base presets carry public RPC + basescan explorer config. Default network is unchanged (`0g-mainnet`).
- **Pluggable storage backends.** `uploadBundle`/`fetchBundle` keep their signatures but route through a `StorageBackend` interface ([`packages/sdk/src/node/storage/`](./packages/sdk/src/node/storage)) with two implementations:
  - `0g` — the existing 0G Storage path; `@0gfoundation/0g-ts-sdk` is now **lazily imported** (only loaded when the 0g backend is used). Uploads sign the storage tx on the chain named by the new `storageNetwork` setting (default: the selected network when it is 0G-family, else `0g-mainnet`).
  - `ipfs` — NEW: uploads via any `pinFileToIPFS`-compatible pinning API (default `https://api.pinata.cloud/pinning/pinFileToIPFS`, Bearer token required, pins as **CIDv0**) and fetches via a public HTTP gateway (default `https://ipfs.io`). No wallet, no gas.
  - Default backend by chain family: 0G chains → `0g`; Base chains → `ipfs` (Base users never need a 0G wallet).
  - `fetchBundle(ref, config, outDir?)` accepts a bare `0x` rootHash (backend = `config.storage`, default `0g` — old behavior), `ipfs://<cid>`, a bare `Qm...` CID, or `0g://0x...`.
- **Bundle-reference codec.** [`packages/sdk/src/bundle-ref.ts`](./packages/sdk/src/bundle-ref.ts) (exported from `@0gzk/sdk` and `/node`): for IPFS-hosted bundles the registry's `bytes32 rootHash` = the CIDv0 sha2-256 digest (bijective; `cidToRootHash`/`rootHashToCidV0`), and the bundle URI `ipfs://<cid>` is stored in the on-chain record's `metadataURI` field. `parseBundleRef(record)` resolution rule: `metadataURI` starting with `ipfs://` → IPFS (digest must match `rootHash`, else error); `0g://` → 0G; anything else (empty, `https://` link, the legacy `0gzk://name@version` convention) → 0G Storage by `rootHash`, fully backwards compatible. Also exports `formatBundleUri`, `backendForRef`. **`CircuitRegistry.sol` is unchanged — no redeploys needed on 0G.**
- **Config surface.** [`packages/sdk/src/node/config.ts`](./packages/sdk/src/node/config.ts): `StorageConfig` gains `storage` (`"0g"`|`"ipfs"`), `storageNetwork` (`"0g-mainnet"`|`"0g-testnet"`), and `ipfs` (`{apiUrl, apiToken?, gateway}`). Env resolution order per field: explicit override → new generic `OGZK_*` env → legacy `OG_*` env → preset. New env vars: `OGZK_NETWORK`, `OGZK_RPC_URL`, `OGZK_PRIVATE_KEY`, `OGZK_STORAGE`, `OGZK_STORAGE_NETWORK`, `OGZK_IPFS_API_URL`, `OGZK_IPFS_API_TOKEN`, `OGZK_IPFS_GATEWAY`. Legacy `OG_NETWORK`/`OG_RPC_URL`/`OG_INDEXER_URL`/`OG_PRIVATE_KEY` all still work. `requireSigningConfig`'s error now names `OGZK_PRIVATE_KEY`/`OG_PRIVATE_KEY`.
- **CLI additions** ([`packages/cli`](./packages/cli)):
  - `--network` accepts the four canonical names plus aliases everywhere (help text updated).
  - `0gzk publish` gains `--storage <0g|ipfs>` and `--storage-network`. Publishing with a non-0G backend forces the bundle URI into the on-chain `metadataURI` (a conflicting `--metadata-uri` errors). Cross-chain publishes (registry on Base + storage on 0G) print a two-chains-need-gas note. `.published.json` gains `uri`/`storage`/`chainId` fields.
  - `0gzk fetch <ref>` accepts `rootHash` | `ipfs://cid` | `Qm...` | `0g://0x...`, plus `--storage` for bare hashes.
  - `0gzk registry register` gains `--uri` (validated against the rootHash via `parseBundleRef`; also auto-inferred from the bundle's `.published.json` when it matches).
  - `0gzk config` gains keys: `storage`, `storageNetwork`, `ipfsApiUrl`, `ipfsApiToken` (secret, masked), `ipfsGateway`, `anthropicApiKey` (secret, masked; for the upcoming `0gzk agent`).
- **vkeyHash verification on fetch-by-name.** CLI (`prove --name`, `registry resolve`) and the web app now resolve the record → `parseBundleRef` → fetch from the right backend → verify the fetched vkey's keccak256 canonical hash against the record's `vkeyHash`, and **warn** on mismatch.
- **Contracts / Base deploys** ([`packages/contracts`](./packages/contracts)): `foundry.toml` gains `base`/`base-sepolia` rpc_endpoints and an `[etherscan]` basescan section (`BASESCAN_API_KEY`); `Deploy.s.sol` reads `DEPLOYER_PRIVATE_KEY` first, falling back to `OG_PRIVATE_KEY`; new scripts `deploy:base`, `deploy:base-sepolia`, `deploy:base-sepolia:verify`. [`registry-addresses.json`](./packages/contracts/registry-addresses.json) and `REGISTRY_ADDRESSES` in the SDK include `84532`/`8453` (null until deployed; Base Sepolia deploy pending). `getRegistryContract` keeps its `chainId = 16661` default for backcompat, but multi-chain callers should always pass it explicitly. `resolveBundle` now passes the full `VersionRecord` as a second argument to the fetch callback so it can route backends (one-arg callbacks still work).
- **Circuit discovery metadata.** `CircuitMetadata` gains optional `tags?: string[]`, `keywords?: string[]`, `useCases?: string[]`; all 14 reference circuits are backfilled with `tags`/`useCases`. New repo-level data files: committed [`circuits/publications.json`](./circuits/publications.json) (per-chain publication records, seeded from local receipts + a live sweep of both 0G registries) and the committed, deterministically generated [`circuits/index.json`](./circuits/index.json) catalog (metadata + example inputs + r1cs constraint counts + publications).
- **`@0gzk/mcp` (new package,** [`packages/mcp`](./packages/mcp)**).** An MCP server for circuit discovery + authoring: 5 discovery tools (`search_circuits`, `list_circuits`, `get_circuit`, `get_example_input`, `resolve_circuit` — chain-aware, catalog-backed in a repo checkout, live-registry-backed anywhere) and 4 authoring tools (`scaffold_circuit`, `validate_metadata`, `build_circuit`, `prove_circuit`), plus `ogzk://guide/circom-authoring` and `ogzk://catalog` resources. Ships a `0gzk-mcp` stdio binary; the repo carries a pre-wired [`.mcp.json`](./.mcp.json) for Claude Code. Built on `@modelcontextprotocol/server` v2.
- **`0gzk agent` (new CLI command).** Terminal AI assistant with a Claude Code-style interface (welcome banner, streamed output, `⏺ tool(args)` / `⎿ result` trace lines, per-turn footer). One-shot (`0gzk agent "which circuit ..."`) and interactive chat. Two modes:
  - **Default — hosted, no API key.** The conversation goes to the 0gzk web deployment's new `POST /api/agent` route ([`web/app/api/agent`](./web/app/api/agent)), which runs `gpt-5-nano` (server-side `OPENAI_API_KEY`; `OGZK_AGENT_MODEL`/`OPENAI_BASE_URL` overridable for OpenAI-compatible providers) together with the 5 MCP discovery tools and the bundled circuit catalog, returning `{ reply, trace, model }`. CLI endpoint override: `0gzk config set agentUrl <url>` / `OGZK_AGENT_URL`.
  - **`--local`** — Claude Agent SDK in-process with the full 9-tool set including authoring (scaffold → build → prove), `--model` (default `claude-sonnet-5`), `--max-turns`, `--full-access`. Auth via `ANTHROPIC_API_KEY` / `0gzk config set anthropicApiKey`, falling back to a local Claude Code login. `@anthropic-ai/claude-agent-sdk` is an **optional** peer dependency, lazily imported with a friendly install hint.
- **Web `/ai` page** — agent & MCP guide with copyable install commands (`npm i -g @0gzk/cli`, `npm i @0gzk/sdk snarkjs`, `claude mcp add 0gzk -- npx -y @0gzk/mcp`), the nine-tool reference, and a sample session; the landing page gains an INSTALL block and the header an AI link.
- **`0gzk catalog` (new CLI command group).** `build` regenerates `circuits/index.json` + the `circuits/README.md` table (spliced between `CATALOG:BEGIN/END` markers), `check` exits 1 when stale (wired into CI), `import-publications` upserts `circuits/publications.json` from local gitignored `.published.json` receipts.
- New docs pages: [`docs/content/networks.mdx`](./docs/content/networks.mdx) ("Networks & storage": chain table, storage-backend matrix, bundle-URI convention spec, cross-chain gas note, publish-to-Base-Sepolia quickstart), [`docs/content/mcp.mdx`](./docs/content/mcp.mdx), and [`docs/content/agent.mdx`](./docs/content/agent.mdx).

### Changed

- **Monorepo consolidation.** `docs/`, `examples/`, and `web/` are now plain directories of the single repo [`0gzk/core`](https://github.com/0gzk/core) (submodules absorbed, fresh history).
- **Web app** ([`web/`](./web)) is now a pnpm workspace member consuming `@0gzk/sdk` via `workspace:^`. Env `OGZK_NETWORK`/`NEXT_PUBLIC_OGZK_NETWORK` select the chain (aliases OK; `OG_NETWORK`/`NEXT_PUBLIC_OG_NETWORK` still honored); `OGZK_REGISTRY_ADDRESS` is also read (`OG_REGISTRY_ADDRESS` still works). Explorer links now come from the chain preset — **chainscan for 0G (changed from the old explorer.0g.ai links), basescan for Base**. IPFS-hosted bundles resolve via the configured gateway. See [`web/.env.template`](./web/.env.template).
- Examples: `04-resolve-by-name` accepts `OG_CHAIN_ID` and documents a Base Sepolia invocation; `03-verify-on-chain`'s `foundry.toml` gains a `base-sepolia` endpoint. The `--legacy` forge flag is **0G-only** — Base uses standard EIP-1559, do not pass `--legacy` there.
- `@0gzk/sdk` and `@0gzk/cli` bumped to `0.4.0`.

---

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
