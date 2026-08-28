# @0gzk/cli

Command-line tool for the [0gzk](https://github.com/0gzk/core) ZK Proof-as-a-Service platform. Publish Circom circuit bundles to decentralized storage (0G Storage or IPFS), register them on-chain (0G or Base), fetch them back, generate Groth16 proofs locally — witness data never leaves your machine — and chat with an AI agent that finds the circuit you need.

## Install

```bash
npm install -g @0gzk/cli
```

Provides the `0gzk` binary.

## Quick start

```bash
# Ask the AI which circuit you need — no API key required
0gzk agent "how do I prove someone is over 18 without their birthday?"

# Prove against a published circuit by name
0gzk prove --name age_verification ./input.json

# Browse what's registered
0gzk registry list
```

## Networks

`--network` (or `0gzk config set network …`) accepts:

| Network | Chain ID | Registry | Default storage |
| --- | --- | --- | --- |
| `0g-mainnet` (default) | 16661 | baked in | 0G Storage |
| `0g-testnet` | 16602 | baked in | 0G Storage |
| `base` | 8453 | pending deploy | IPFS |
| `base-sepolia` | 84532 | pending deploy | IPFS |

`mainnet` / `testnet` still work as deprecated aliases for the 0G pair. On Base, bundles pin to IPFS (any `pinFileToIPFS`-compatible service; set `ipfsApiToken`) so no 0G wallet is ever needed.

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

Chat with an AI assistant that knows every published circuit. **No API key needed** — the conversation runs through the hosted 0gzk backend (`https://0gzk.com/api/agent`; override with `agentUrl`), which searches the circuit catalog and live registries server-side and returns the answer with a full tool trace.

```bash
0gzk agent "which circuit fits a sealed-bid auction?"   # one-shot
0gzk agent                                              # interactive chat
```

Circuit authors: `0gzk agent --local` runs the Claude Agent SDK in-process with the full authoring toolset (scaffold → build → prove). Needs `@anthropic-ai/claude-agent-sdk` installed plus an Anthropic key (`0gzk config set anthropicApiKey …`) or a Claude Code login.

### `0gzk publish <bundleDir>`

Pack a `circuit_bundle/` directory, upload it to storage, and optionally register it on-chain in the same run.

```bash
0gzk publish ./circuit_bundle --register                      # 0G Storage + 0G registry
0gzk publish ./circuit_bundle --network base-sepolia --register  # IPFS + Base registry
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
