# @0gzk/cli

Command-line tool for the [0gzk](https://github.com/0gzk/core) ZK Proof-as-a-Service platform on 0G Storage. Publish a circuit bundle to 0G, fetch it back by root hash, and generate Groth16 proofs locally — witness data never leaves your machine.

## Install

```bash
npm install -g @0gzk/cli
```

Provides the `0gzk` binary.

## Configuration

Uploads need a funded wallet on the chosen 0G network. Defaults target **0G mainnet** (chain ID 16661). The CLI **does not read `.env` files** — set values once with `0gzk config set` and they're persisted to `~/.0gzk/config.json`:

```bash
0gzk key 0x...                             # shortcut for `config set privateKey 0x...`
0gzk config set network mainnet            # default; set to "testnet" for Galileo
0gzk config set rpcUrl https://evmrpc.0g.ai
0gzk config set indexerUrl https://indexer-storage-turbo.0g.ai
0gzk config set registry 0xCe9f0DF51abeC7B8cD751067c6D8d3db5E2bE64d

0gzk config get                            # show current values + their source
0gzk config get privateKey --show          # reveal the private key
0gzk config unset registry                 # back to baked-in default
0gzk config path                           # print path to config.json
```

The file is written with mode `0600` (owner-only). Downloads do not require a key.

### Resolution priority

Highest wins:

1. CLI flag (`--key`, `--network`, `--rpc-url`, `--indexer-url`, `--registry`)
2. Shell environment variable (`OG_PRIVATE_KEY`, `OG_NETWORK`, `OG_RPC_URL`, `OG_INDEXER_URL`, `OGZK_REGISTRY_ADDRESS`) — useful in CI
3. `~/.0gzk/config.json` (managed by `0gzk config`)
4. Built-in network preset

Override the config directory for tests with `OGZK_CONFIG_DIR=/some/path`.

### Galileo testnet

```bash
0gzk config set network testnet
# Defaults flip to:
#   rpcUrl     https://evmrpc-testnet.0g.ai
#   indexerUrl https://indexer-storage-testnet-turbo.0g.ai
#   registry   0x5b2c3e86c9255a4459199a6d9cb7b63e2a660ce6
```

Get testnet 0G from the [official faucet](https://faucet.0g.ai).

## Commands

### `0gzk key <hex>`

Shortcut for `0gzk config set privateKey <hex>`. Stores the signing key in `~/.0gzk/config.json` (mode `0600`).

### `0gzk config <set|get|list|unset|path>`

Read and write persistent CLI settings stored in `~/.0gzk/config.json`. Allowed keys: `privateKey`, `network`, `rpcUrl`, `indexerUrl`, `registry`. Values are validated before being written. See [Configuration](#configuration) above for examples.

### `0gzk publish <bundleDir>`

Pack a `circuit_bundle/` directory and upload it to 0G Storage.

```bash
0gzk publish ./circuit_bundle
# -> rootHash, txHash, txSeq, explorer link
# -> writes .published.json receipt into the bundle dir (suppress with --no-receipt)
```

### `0gzk fetch <rootHash> [outputDir]`

Download a bundle by root hash and untar it.

```bash
0gzk fetch 0x5aa4e2... /tmp/0gzk-fetched
```

### `0gzk prove <inputFile>`

Validate inputs against the circuit's `metadata.inputs`, run `snarkjs.groth16.fullProve` in-process, then verify locally. Writes `proof.json`, `public.json`, and a `result.json` summary.

```bash
# Local bundle
0gzk prove --bundle ./circuit_bundle ./example_input.json

# Remote bundle (cached on first run, reused after)
0gzk prove --root-hash 0x5aa4e2... ./example_input.json
```

Useful flags:

- `--out <dir>` — output dir (default `./proof-<timestamp>/`).
- `--no-verify` — skip local verification.
- `--network <mainnet|testnet>` — override the 0G network for `--root-hash`.
- `--indexer-url <url>` — override the indexer endpoint.

The emitted `proof.json` and `public.json` are byte-compatible with the standalone `snarkjs` CLI, so any third party can verify them with `snarkjs groth16 verify`.

## License

[MIT](./LICENSE)
