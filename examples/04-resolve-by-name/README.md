# 04 - Resolve by name

Smallest possible 0gzk script. Reads one circuit's record from the on-chain
registry and prints it as JSON. No 0G Storage, no proving, no key.

This is the "phone book" example - useful for dashboards, CI gates that pin a
specific `vkeyHash`, indexers, anything that needs to know "what does
`<name>@<version>` resolve to right now?"

## Run it

```bash
pnpm install --frozen-lockfile --ignore-workspace
pnpm smoke              # node resolve.mjs poseidon_preimage
# or
node resolve.mjs age_verification@0.1.0
```

Sample output:

```json
{
  "name": "poseidon_preimage",
  "version": "0.1.0",
  "rootHash": "0x...",
  "vkeyHash": "0x...",
  "verifier": "0x...",
  "publisher": "0xE3641fB2b62DCe2f2e4F7370be1F67c740b79Fc7",
  "publishedAt": "2026-05-10T...",
  "metadataURI": "0gzk://poseidon_preimage@0.1.0",
  "links": {
    "publisher": "https://chainscan-galileo.0g.ai/address/0x...",
    "verifier": null,
    "registry": "https://chainscan-galileo.0g.ai/address/0x5b2c3e86..."
  }
}
```

Exit code is `0` on success, `1` if the requested name isn't registered (zero
rootHash).

## What the code does

The whole script is around 25 lines. Three calls:

```js
const registry = getRegistryContract(provider, REGISTRY);

const { version, record } = parsed.version
  ? { version: parsed.version, record: await getVersion(registry, name, parsed.version) }
  : await getLatest(registry, parsed.name);
```

`record` is a `VersionRecord` and matches the on-chain struct
`CircuitRegistry.Version`. Fields:

| Field | Type | Notes |
| --- | --- | --- |
| `rootHash` | `bytes32` | 0G Storage content address for the bundle tarball |
| `vkeyHash` | `bytes32` | keccak256 of the verification key (pin this in your contract) |
| `verifier` | `address` | Solidity `IGroth16Verifier`; zero address if none set |
| `publisher` | `address` | who published the version (immutable) |
| `publishedAt` | `uint256` | Unix seconds |
| `metadataURI` | `string` | free-form pointer the publisher set, e.g. `0gzk://name@version` |

## Why use this instead of `ethers` directly?

You could. The SDK adds three small affordances:

1. Built-in registry address per chain (looks up `0x5b2c3e86...0ce6` for chain
   16602 automatically).
2. ABI bundled, decoded result, `bigint`-to-`number` for `publishedAt`.
3. A `parseNameSpec` helper that accepts both `<name>` and `<name>@<version>`.

If those don't matter to you, `new Contract(REGISTRY, [...], provider)` is all
the SDK is doing under the hood.

## Environment

| Variable | Default |
| --- | --- |
| `OG_RPC_URL` | `https://evmrpc-testnet.0g.ai` |
| `OG_EXPLORER` | `https://chainscan-galileo.0g.ai` |
| `OG_REGISTRY_ADDRESS` | (built-in for chain 16602) |
