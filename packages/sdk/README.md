# @0gzk/sdk

ZK Groth16 prover, storage backends, and registry client for the [0gzk](https://github.com/0gzk/core) ZK Proof-as-a-Service platform. Four subpaths, picked automatically by your runtime:

- **`@0gzk/sdk`** — isomorphic (Node + browser): `generateProof`, `verifyLocal`, `validateInputs`, `BundleFiles`, `CircuitMetadata`, `InputValidationError`, plus the chain presets (`NETWORKS`, `resolveNetwork`, explorer URL helpers — 0G mainnet/testnet, Base, Base Sepolia) and the bundle-reference codec (`parseBundleRef`, `cidToRootHash`). Wraps `snarkjs.groth16` with metadata-driven input validation.
- **`@0gzk/sdk/node`** — Node-only: `uploadBundle`, `fetchBundle`, `loadConfig`, `readBundleFromDir`, routed through pluggable storage backends — 0G Storage (via a lazily-imported `@0gfoundation/0g-ts-sdk`) or any `pinFileToIPFS`-compatible IPFS pinning service (no wallet, no gas).
- **`@0gzk/sdk/onchain`** — isomorphic: `getRegistryContract`, `getVersion`, `getLatest`, `listCircuits`, `resolveBundle`, `parseNameSpec`. Resolves circuits by name through the on-chain `CircuitRegistry` on any supported chain.
- **`@0gzk/sdk/build`** — Node-only: `buildCircuitBundle` and friends — the pure-JS trusted-setup pipeline (ptau fetch with BLAKE2b check, Groth16 setup, verifier export, bundle assembly).

Witness data never leaves the calling process — proofs are generated client-side and only `proof + publicSignals` go anywhere else.

## Install

```bash
npm i @0gzk/sdk snarkjs
# or, with Node uploads/downloads + on-chain resolution:
npm i @0gzk/sdk snarkjs @0gfoundation/0g-ts-sdk ethers
```

`snarkjs` is a hard peer. `@0gfoundation/0g-ts-sdk` and `ethers` are optional peers — `ethers` is required for `/onchain` and `/build`; `@0gfoundation/0g-ts-sdk` only when the 0G storage backend is actually used (IPFS-only consumers can skip it).

## TL;DR

```ts
import { generateProof, verifyLocal, type BundleFiles } from "@0gzk/sdk";

const bundle: BundleFiles = { wasm, zkey, vkey, metadata };
const inputs = { birthYear: 1990, currentYear: 2026, minAge: 18 };

const { proof, publicSignals } = await generateProof(bundle, inputs);
const ok = await verifyLocal(bundle, { proof, publicSignals });
```

`generateProof` validates `inputs` against `metadata.inputs` (`uint`, `bool`, `field`, `uint[]`, `field[]` — with optional `length`) before calling `snarkjs.groth16.fullProve`. Bad input throws `InputValidationError` with a list of all problems.

## Pull a bundle from 0G Storage (Node-only)

```ts
import { fetchBundle, loadConfig } from "@0gzk/sdk/node";

const config = loadConfig({});
const bundle = await fetchBundle(rootHash, config, "/tmp/my-bundle");
```

Set `OG_PRIVATE_KEY` if you also need to `uploadBundle`. Reads do not require a wallet.

## Resolve a circuit by name from the registry

```ts
import { JsonRpcProvider } from "ethers";
import { getRegistryContract, resolveBundle, parseNameSpec } from "@0gzk/sdk/onchain";
import { fetchBundle, loadConfig } from "@0gzk/sdk/node";

const registry = getRegistryContract(new JsonRpcProvider("https://evmrpc.0g.ai"));
const { record, bundle } = await resolveBundle(
  registry,
  parseNameSpec("age_verification@0.1.0"),
  (root) => fetchBundle(root, loadConfig({}), `/tmp/0gzk/${root}`),
);
```

## Full guide → [USAGE.md](./USAGE.md)

`USAGE.md` has copy-pasteable recipes for browser ESM, Next.js App Router, plain Node scripts, registry-driven proving, and CI / programmatic CLI usage, plus an input-validation cheatsheet.

## License

[MIT](./LICENSE)
