# 05 - Publish your own circuit

A guided walk from a freshly-written `.circom` file to a discoverable entry in
the on-chain `CircuitRegistry`. After this, anyone with `@0gzk/cli` or
`@0gzk/sdk` can prove against your circuit by name.

The example circuit is [`private_multiply.circom`](./private_multiply.circom):

```circom
template Multiply() {
    signal input x;
    signal input y;
    signal output out;
    out <== x * y;
}
component main = Multiply();
```

Both `x` and `y` are private; `out` is public. A proof says "I know two
factors of `out`" without revealing either factor.

## Prereqs

You install these once, anywhere; the script doesn't care where they live.

| Tool | Why | How |
| --- | --- | --- |
| [`circom`](https://docs.circom.io/getting-started/installation/) 2.x | Compile `.circom` -> r1cs + wasm | `cargo install --git https://github.com/iden3/circom.git` |
| `node` >= 20 | Runs `snarkjs` and `@0gzk/cli` | nvm, asdf, etc |
| `bash` + `curl` | The build script and ptau download | standard on macOS / Linux / WSL / Git Bash |
| A Galileo-funded private key | Pays for the 0G Storage upload + the registry `claimName` / `publishVersion` txs | [Faucet](https://faucet.0g.ai) |

## Step 1: build the bundle

There are two ways. Both produce the same `circuit_bundle/`; pick whichever
matches how you already work.

### Option A: bash + snarkjs CLI ([`build.sh`](./build.sh))

Zero JS deps to think about. Everything runs through `npx --yes snarkjs ...`
so you don't even need `pnpm install` first.

```bash
bash build.sh
```

### Option B: SDK ([`build.mjs`](./build.mjs))

If you're already in a Node project, `@0gzk/sdk/build` collapses steps 2-6
of `build.sh` into one async call. The only thing that still shells out is
`circom` (no JS bindings). The SDK handles the Powers of Tau download +
BLAKE2b integrity check, the `groth16 setup`, the contribution with random
entropy, and the verifier export. Then it auto-loads `.env` and shells the
finished bundle into `npx @0gzk/cli publish --register`, so a single command
takes you from `.circom` to a `CircuitRegistry` entry.

```bash
cp .env.example .env       # then fill in OG_PRIVATE_KEY
pnpm install --ignore-workspace
pnpm build:sdk             # = node build.mjs
# pnpm build:sdk -- --no-publish     # stop after the bundle, skip publish
```

Either way you'll see roughly:

```
==> [1/6] Compiling private_multiply.circom
==> [fetching-ptau] Resolving Powers of Tau (size 12)
==> [setup] Running Groth16 setup + contribution
==> [exporting-vkey] Exported verification_key.json
==> [exporting-verifier] Exported verifier.sol
==> [assembling] Assembling bundle in ./circuit_bundle
==> [done] Bundle ready at ./circuit_bundle (vkeyHash 0x...)
```

The contents of `circuit_bundle/` are everything `0gzk publish` needs:

```
circuit_bundle/
  metadata.json           circuit.wasm
  circuit_final.zkey      verification_key.json
  verifier.sol
```

Use `build.sh` if you want a single-file lift-and-shift into a non-Node
repo. Use `build.mjs` if you want progress events, a typed `vkeyHash` you
can hand straight to `publishVersion`, or you're chaining the build with
`uploadBundle` and the on-chain registry call from your own script.

## Step 2: publish

Copy `.env.example` to `.env`, fill in `OG_PRIVATE_KEY`, then:

```bash
export $(grep -v '^#' .env | xargs)
npx @0gzk/cli@^0.2.1 publish circuit_bundle \
  --register \
  --metadata-uri "0gzk://private_multiply@0.1.0" \
  --wait 10m
```

What this does:

1. Packs `circuit_bundle/` into a tarball.
2. Uploads it to 0G Storage. The CLI prints the `rootHash` the moment it
   knows it (so a slow finalization still leaves you with a known hash).
3. If `--register` is set, calls `CircuitRegistry.claimName(name)` on Galileo
   (first time) and `publishVersion(name, version, rootHash, vkeyHash,
   verifier, metadataURI)`.
4. Drops a receipt JSON locally so you have all the addresses in one place.

If finalization stalls past `--wait 10m`, the CLI exits with code 2 and
prints the recovery command:

```bash
npx @0gzk/cli@^0.2.1 registry register <rootHash> --bundle circuit_bundle
```

That re-uses the rootHash you already have, no re-upload.

## Step 3: prove against it

The circuit is now live on Galileo. From any machine:

```bash
echo '{"x": 3, "y": 5}' > input.json
npx @0gzk/cli@^0.2.1 prove input.json --name private_multiply@0.1.0
```

Or programmatically: see [`../01-prove-in-node`](../01-prove-in-node) for the
Node SDK flow, or [`../02-prove-in-browser`](../02-prove-in-browser) for the
client-side flow. Both work without any change beyond pointing at your
circuit's name.

## Going fully programmatic (build + upload + register in one script)

`build.mjs` stops at "bundle on disk." If you want to skip the CLI entirely
and chain straight into the registry, the SDK exposes the next two steps:

```js
import { buildCircuitBundle } from "@0gzk/sdk/build";
import { uploadBundle, loadConfig } from "@0gzk/sdk/node";
import { getRegistryContract } from "@0gzk/sdk/onchain";
import { JsonRpcProvider, Wallet } from "ethers";

const built = await buildCircuitBundle({ /* same opts as build.mjs */ });

const config = loadConfig();          // OG_PRIVATE_KEY, OG_RPC_URL, ...
const { rootHash } = await uploadBundle(built.bundleDir, config);

const wallet = new Wallet(config.privateKey, new JsonRpcProvider(config.rpcUrl));
const registry = getRegistryContract(wallet);

// Existing owner only needs publishVersion. First-time publishers also call
// claimName(name) once before this.
await registry.publishVersion(
  built.metadata.name,
  built.metadata.version,
  rootHash,
  built.vkeyHash,
  /* verifier addr */ "0x0000000000000000000000000000000000000000",
  `0gzk://${built.metadata.name}@${built.metadata.version}`,
);
```

That's the whole "I have a `.circom`, please put it on chain" pipeline in a
~20-line script, no shellouts after `circom`.

## What's in the bundle

```
circuit_bundle/
  metadata.json           # human-readable shape (this file is its source)
  circuit.wasm            # witness generator
  circuit_final.zkey      # proving key (Groth16)
  verification_key.json   # what `snarkjs.groth16.verify` consumes
  verifier.sol            # Solidity Groth16 verifier (for on-chain use)
```

The 0gzk SDK only ever reads `metadata.json`, `circuit.wasm`,
`circuit_final.zkey`, and `verification_key.json`. `verifier.sol` is there
for `forge create` (see [`../03-verify-on-chain`](../03-verify-on-chain)).

## What's in `metadata.json`

```json
{
  "name": "private_multiply",
  "version": "0.1.0",
  "protocol": "groth16",
  "curve": "bn128",
  "inputs":  { "x": { "type": "uint", "visibility": "private" }, ... },
  "outputs": { "out": { "type": "uint" } },
  "files":   { "wasm": "circuit.wasm", "zkey": "circuit_final.zkey", ... }
}
```

The SDK uses `inputs` to validate proof inputs before snarkjs runs (catches
typos at the SDK layer rather than as low-level circom panics). The
visibility flag determines whether a signal is permitted as a `public` input
or must be supplied as `private` witness data.

## Why we don't CI-smoke this example

Both build paths shell out to `circom` (not installable via npm) and the
publish step requires both network access to Galileo + a funded private
key. Those are reasonable for a real circuit author to set up locally, but
they don't belong in our default CI matrix. The READMEs in
[`01-prove-in-node`](../01-prove-in-node) and
[`04-resolve-by-name`](../04-resolve-by-name) do exercise the registry
in CI - so an end-to-end "I just published, can I see it?" cycle is
catchable as soon as the change lands.

## Cleaning up

```bash
rm -rf build/ circuit_bundle/ .cache/ node_modules/
```

`build/` is large (~10 MB), `.cache/` (~10 MB), `circuit_bundle/` (~1 MB).
