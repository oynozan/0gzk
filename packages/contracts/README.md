# @0gzk/contracts

Foundry project for the 0gzk on-chain pieces:

- [`src/CircuitRegistry.sol`](./src/CircuitRegistry.sol) — name-indexed registry mapping `(name, version)` to `{rootHash, vkeyHash, verifier, publisher, publishedAt, metadataURI}`.
- [`src/IGroth16Verifier.sol`](./src/IGroth16Verifier.sol) — minimal interface for snarkjs-generated verifiers.
- [`test/CircuitRegistry.t.sol`](./test/CircuitRegistry.t.sol) — unit tests covering claim, publish, immutability, verifier swap, transfer, paging, and name validation.
- [`script/Deploy.s.sol`](./script/Deploy.s.sol) — deploy script. Targets 0G mainnet (chain id 16661) by default; supports Galileo testnet (chain id 16602) too.

## Prerequisites

```bash
# install Foundry (forge, cast, anvil)
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

`forge-std` (v1.16.1) is vendored directly under `packages/contracts/lib/forge-std/` — it ships with the repo, no extra install step. To upgrade it: `forge install foundry-rs/forge-std`, delete the `.git` metadata it leaves inside `lib/forge-std/`, update the pin in `foundry.lock`, and commit the changed files.

## Workflow

```bash
pnpm --filter @0gzk/contracts build          # forge build
pnpm --filter @0gzk/contracts test           # forge test
pnpm --filter @0gzk/contracts fmt            # forge fmt
pnpm --filter @0gzk/contracts fmt:check      # forge fmt --check (used in CI)
```

## Deploy to 0G mainnet

```bash
export OG_RPC_URL=https://evmrpc.0g.ai
export OG_PRIVATE_KEY=0x<your_funded_mainnet_key>

pnpm --filter @0gzk/contracts deploy:mainnet
```

After the broadcast, the deployed registry address is printed and committed into [`registry-addresses.json`](./registry-addresses.json) under the appropriate `chainId` so the SDK and CLI can resolve it without a manual flag.

The current mainnet deployment lives at [`0xCe9f0DF51abeC7B8cD751067c6D8d3db5E2bE64d`](https://chainscan.0g.ai/address/0xCe9f0DF51abeC7B8cD751067c6D8d3db5E2bE64d).

### Deploy to 0G Galileo testnet (optional)

```bash
export OG_RPC_URL=https://evmrpc-testnet.0g.ai
export OG_PRIVATE_KEY=0x<your_funded_galileo_key>

pnpm --filter @0gzk/contracts deploy:galileo
```

The Galileo deployment lives at [`0x5b2c3e86c9255a4459199a6d9cb7b63e2a660ce6`](https://chainscan-galileo.0g.ai/address/0x5b2c3e86c9255a4459199a6d9cb7b63e2a660ce6).
