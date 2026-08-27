# 0gzk examples

Standalone, copy-pasteable reference projects for the published
[`@0gzk/sdk`](https://www.npmjs.com/package/@0gzk/sdk) (`0.2.0`) and
[`@0gzk/cli`](https://www.npmjs.com/package/@0gzk/cli) (`^0.2.1` — `0.2.0`
shipped with a broken manifest; see [CHANGELOG](../CHANGELOG.md)).

Each subdirectory is its own npm/Foundry project with its own `package.json`,
its own lockfile, and no dependency on the monorepo workspace. They install
straight from npm so they also double as a release smoke test of the published
tarballs.

## Where to start

Pick the example that matches what you're trying to do:

| If you want to... | Start with |
| --- | --- |
| Generate a proof from a Node script | [`01-prove-in-node`](./01-prove-in-node) |
| Generate a proof from a browser app | [`02-prove-in-browser`](./02-prove-in-browser) |
| Verify a 0gzk proof on chain in your Solidity contract | [`03-verify-on-chain`](./03-verify-on-chain) |
| Look up a circuit's `rootHash` / `vkeyHash` / verifier from the registry | [`04-resolve-by-name`](./04-resolve-by-name) |
| Publish your own circuit to 0G Storage and the registry | [`05-publish-your-own`](./05-publish-your-own) |

Together they cover the full loop:

```
write a circuit  ->  publish  ->  resolve  ->  prove (Node or browser)  ->  verify on chain
        |               |            |                  |                          |
   ex 05         CLI + ex 05      ex 04           ex 01 / ex 02                  ex 03
```

## Conventions

- Examples talk to the **Galileo testnet** by default
  (`https://evmrpc-testnet.0g.ai`, `https://indexer-storage-testnet-turbo.0g.ai`,
  registry at [`0x5b2c3e86…0ce6`](https://chainscan-galileo.0g.ai/address/0x5b2c3e86c9255a4459199a6d9cb7b63e2a660ce6)).
  Override with `OG_RPC_URL`, `OG_INDEXER_URL`, and `OG_REGISTRY_ADDRESS` env
  vars if you're pointing at a fork or a private deployment.
- Examples that publish (05) need a funded `OG_PRIVATE_KEY`. Read-only examples
  (01 - 04) need nothing but network access.
- Each example installs against `@0gzk/sdk@^0.2.0` from npm. To dev against
  unreleased SDK source, override locally with `pnpm pkg set
  dependencies.@0gzk/sdk=link:../../packages/sdk` or `npm link` — neither is
  the default, and CI runs against npm.

## Running

```bash
cd examples/01-prove-in-node
pnpm install --frozen-lockfile --ignore-workspace
pnpm smoke              # the canonical "does it still work" command
```

`--ignore-workspace` tells pnpm to treat the example as standalone instead of
folding it into the parent 0gzk monorepo (where the examples are deliberately
not declared as workspace members). When you copy an example into its own
repo, drop the flag.

Each example documents its own `pnpm smoke` (or `forge test` for 03) in its
README. CI runs the smoke for examples 01, 03, and 04 on every push; 02 and 05
are documented manual runs (browser, and circuit-author flow respectively).

## Reference circuits available on Galileo

These are already published to the on-chain registry and ready to be proven
against by any of the read-only examples:

| Name | Version | Bundle on 0G Storage |
| --- | --- | --- |
| `age_verification` | `0.1.0` | resolves via registry |
| `poseidon_preimage` | `0.1.0` | resolves via registry |
| `merkle_membership` | `0.1.0` | resolves via registry |
| `private_balance_threshold` | `0.1.0` | resolves via registry |

`npx @0gzk/cli@^0.2.1 registry list` always returns the current set.
