# @0gzk/cli

Command-line tool for the [0gzk](https://github.com/0gzk/core) ZK Proof-as-a-Service platform. Publish Circom circuit bundles to decentralized storage (IPFS or 0G Storage), register them on-chain (Base or 0G), fetch them back, generate Groth16 proofs locally — witness data never leaves your machine — or describe what you want to prove and let the built-in AI agent run the whole job for you.

## Install

```bash
npm install -g @0gzk/cli
```

Provides the `0gzk` binary.

## Quick start

```bash
# Let the AI do it: finds the circuit, asks for what it needs, proves locally.
# No API key required.
0gzk agent "Prove that I am over 18. I was born in 1990, the current year is 2026. Save the proof to ./proof"

# Prove against a published circuit by name
0gzk prove --name age_verification ./input.json

# Browse what's registered
0gzk registry list
```

## Networks

`--network` (or `0gzk config set network …`) accepts:

| Network | Chain ID | Registry | Default storage |
| --- | --- | --- | --- |
| `base` **(default)** | 8453 | baked in | IPFS |
| `base-sepolia` | 84532 | baked in | IPFS |
| `0g-mainnet` | 16661 | baked in | 0G Storage |
| `0g-testnet` | 16602 | baked in | 0G Storage |

`mainnet` / `testnet` still work as deprecated aliases for the 0G pair. With nothing configured the CLI talks to **Base mainnet** and pins bundles to **IPFS** (any `pinFileToIPFS`-compatible service; set `ipfsApiToken`), so no 0G wallet is needed. `0gzk config set network 0g-mainnet` — or `--network 0g-mainnet` / `OGZK_NETWORK=0g-mainnet` — switches the registry chain *and* the storage backend back to 0G.

## Configuration

The CLI **does not read `.env` files** — set values once with `0gzk config set` and they persist to `~/.0gzk/config.json` (mode `0600`, secrets masked in `config get`):

```bash
0gzk key 0x...                        # shortcut for `config set privateKey 0x...`
0gzk config set network base-sepolia
0gzk config set ipfsApiToken <pinata-jwt>
0gzk config get                       # show current values + their source
```

Keys: `privateKey`, `network`, `rpcUrl`, `indexerUrl`, `registry`, `storage`, `storageNetwork`, `ipfsApiUrl`, `ipfsApiToken`, `ipfsGateway`, `anthropicApiKey`, `agentUrl`.

Resolution priority (highest wins): CLI flag → shell env (`OGZK_*`, legacy `OG_*`) → `~/.0gzk/config.json` → built-in network preset.

## Commands

### `0gzk agent [prompt...]`

An agent that **does the job**, not one that tells you which command to type: it finds the circuit, shows you the signals it needs, asks for any values you did not give, validates them, runs the prover, and saves the artifacts.

```bash
0gzk agent "Prove that I am over 18. I was born in 1990, the current year is 2026. Save the proof to /tmp/agent-proof"
# ⏺ search_circuits({"query":"prove age over 18"})
# ⏺ validate_inputs({"name":"age_verification",…})          · local
# ⏺ prove_circuit({…,"outDir":"/tmp/agent-proof"})          · local
# verified true · publicSignals ["1","2026","18"] · proof.json, public.json, result.json written

0gzk agent                                              # interactive chat
```

**No API key needed** — the conversation runs through the hosted 0gzk backend (`https://0gzk.com/api/agent`; override with `0gzk config set agentUrl …` or `OGZK_AGENT_URL`), which runs the model and the five read-only discovery tools server-side.

**Your inputs stay here.** The three tools that touch this machine — `validate_inputs`, `read_input_file`, `prove_circuit` — are declared to the model but executed by the CLI: the endpoint returns them as `clientToolCalls`, the CLI runs them locally (marked `· local` in the trace) and posts only their results back. `read_input_file` reports signal names and types, never values; `prove_circuit` can take `inputFile` (a local JSON path) instead of inline inputs, and always writes `proof.json` / `public.json` / `result.json` — to `~/.0gzk/proofs/<circuit>-<timestamp>/` by default (`OGZK_PROOFS_DIR` overrides the root), or to an explicit `outDir`. The absolute path comes back in the answer.

Circuit authors: `0gzk agent --local` runs the Claude Agent SDK in-process with the full toolset including authoring (scaffold → build → prove) — 11 tools inside a repo checkout, 8 outside one. Needs `@anthropic-ai/claude-agent-sdk` installed plus an Anthropic key (`0gzk config set anthropicApiKey …`) or a Claude Code login. Flags: `--model`, `--max-turns`, `--full-access`, `--repo-root`.

### `0gzk publish <bundleDir>`

Pack a `circuit_bundle/` directory, upload it to storage, and optionally register it on-chain in the same run.

```bash
0gzk publish ./circuit_bundle --register                        # IPFS + Base registry (defaults)
0gzk publish ./circuit_bundle --network base-sepolia --register # IPFS + Base Sepolia registry
0gzk publish ./circuit_bundle --network 0g-mainnet --register   # 0G Storage + 0G registry
```

Flags: `--storage <0g|ipfs>`, `--storage-network`, `--metadata-uri`, `--verifier-address`, `--wait <duration>` / `--no-wait`, `--no-receipt`. A `.published.json` receipt lands in the bundle dir.

### `0gzk prove <inputFile>`

Validate inputs against the circuit's schema, run `snarkjs.groth16.fullProve` in-process, verify locally, and write `proof.json` / `public.json` / `result.json`. Outputs are byte-compatible with the standalone `snarkjs` CLI.

```bash
0gzk prove --bundle    ./circuit_bundle   ./input.json
0gzk prove --root-hash 0x5aa4e2...        ./input.json   # cached after first fetch
0gzk prove --name      age_verification   ./input.json   # resolve via registry
```

### `0gzk registry <list|get|resolve|register>`

Browse and resolve circuits via the on-chain `CircuitRegistry`; `register` is the recovery path for uploads whose finalization timed out (`--uri ipfs://…` supported). Fetch-by-name verifies the bundle's verification key against the on-chain `vkeyHash` and warns on mismatch.

### `0gzk fetch <ref> [outputDir]`

Download and untar a bundle by `0x` root hash, `ipfs://<cid>`, bare `Qm…` CID, or `0g://0x…`.

### `0gzk catalog <build|check|import-publications>`

Maintain the repo's circuit discovery catalog (`circuits/index.json` + README table). Used inside the [0gzk monorepo](https://github.com/0gzk/core); CI fails when the catalog is stale.

### `0gzk config <set|get|list|unset|path>` · `0gzk key <hex>`

Persistent settings as described under Configuration.

## License

[MIT](./LICENSE)
