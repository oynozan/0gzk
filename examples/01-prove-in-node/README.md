# 01 - Prove in Node

Resolves a 0gzk circuit by name from the on-chain `CircuitRegistry`, downloads
its bundle from 0G Storage, generates a Groth16 proof, and verifies it
locally. Everything in one short file.

## Run it

```bash
pnpm install --frozen-lockfile --ignore-workspace
pnpm smoke            # node prove.mjs age_verification 1990
# or
node prove.mjs age_verification 1990 2026 18
```

(The `--ignore-workspace` flag tells pnpm to install this example as a
standalone project rather than as part of the parent 0gzk monorepo. Drop it if
you've cloned this example out into its own repo.)

You should see something like:

```
[1/3] Resolving on-chain record + downloading bundle from 0G Storage...
      version=0.1.0 rootHash=0x35d357c850... verifier=0x... (842 ms)
[2/3] Generating Groth16 proof...
      done (5821 ms)
[3/3] Verifying locally...
      verified=true

{
  "circuit": { "name": "age_verification", "version": "0.1.0" },
  ...
  "verified": true
}
```

Exit code is `0` on success, `1` if local verification returns `false`.

## What the code does

The whole script is around 50 lines. The interesting calls:

```js
// 1. Bind a read-only ethers Contract to the CircuitRegistry on Galileo.
const registry = getRegistryContract(provider, REGISTRY);

// 2. Resolve `<name>` (or `<name>@<version>`) -> { record, bundle }.
//    `resolveBundle` is bundler-agnostic: in Node we pass `fetchBundle` from
//    @0gzk/sdk/node, in a browser you'd pass a fetcher that uses fetch().
const { record, bundle } = await resolveBundle(
  registry,
  parseNameSpec(spec),
  (rootHash) => fetchBundle(rootHash, { indexerUrl: INDEXER_URL }),
);

// 3. Prove + verify with the bundle's wasm/zkey/vkey in memory.
const proof = await generateProof(bundle, inputs);
const verified = await verifyLocal(bundle, proof);
```

`bundle` is a `BundleFiles` record:

```ts
{ wasm: Uint8Array, zkey: Uint8Array, vkey: object, metadata: object }
```

So the SDK is doing four things for you here: registry lookup, Storage
download, witness generation + proof, and local verification.

## Customizing inputs

The default arguments are sized for `age_verification` (one private
`birthYear`, two public values `currentYear` and `minAge`). To prove against a
different circuit you'd:

1. Read its `metadata.json` shape via `bundle.metadata.inputs` (the resolver
   already gives you the full bundle).
2. Replace the `inputs` object in `prove.mjs` with values matching that shape.

The SDK validates inputs before calling snarkjs, so a mistyped field gives
you a clear `InputValidationError` rather than a low-level circom panic.

## Environment

| Variable | Default | What it does |
| --- | --- | --- |
| `OG_RPC_URL` | `https://evmrpc-testnet.0g.ai` | Chain RPC used for the registry read. |
| `OG_INDEXER_URL` | `https://indexer-storage-testnet-turbo.0g.ai` | 0G Storage indexer used to download the bundle. |
| `OG_REGISTRY_ADDRESS` | (built-in for chain 16602) | Override the registry address if you've deployed a fork. |

No private key is needed - this example only reads.
