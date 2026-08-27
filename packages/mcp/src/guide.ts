/** The circom authoring guide served as the `0gzk://guide/circom-authoring` resource. */
export const GUIDE_TEXT = `# 0gzk circuit authoring guide

## Bundle anatomy

A published 0gzk bundle is a directory (tarballed for storage) of exactly five files:

| File | Purpose |
| --- | --- |
| \`circuit.wasm\` | Witness generator emitted by circom |
| \`circuit_final.zkey\` | Groth16 proving key (phase-2 setup output) |
| \`verification_key.json\` | Groth16 verification key (what \`vkeyHash\` commits to on-chain) |
| \`verifier.sol\` | Solidity verifier exported by snarkjs (optional but conventional) |
| \`metadata.json\` | The circuit's schema — see below |

## metadata.json

Required: \`name\`, \`version\` (semver), \`protocol\` (\`groth16\`), \`curve\` (\`bn128\`),
\`inputs\`, \`outputs\`, \`files\` (the five names above). Each input is
\`{type, visibility: "public"|"private", description?, length?}\`; \`length\` is required for
fixed-size signal arrays (e.g. a depth-8 Merkle path is \`"field[]"\` with \`length: 8\`).

Discovery fields (optional but strongly recommended — search_circuits ranks on them):

- \`description\` — one or two sentences on what is proven
- \`tags\` — short facets like \`"identity"\`, \`"merkle"\`, \`"range"\`
- \`keywords\` — extra search terms not worth a tag
- \`useCases\` — one-line scenarios ("Prove age >= N without revealing DOB")

## Build pipeline (circuits/_lib/build_lib.sh)

Every \`circuits/<name>/build.sh\` sets \`CIRCUIT_NAME\` and \`PTAU_SIZE\` and delegates to the
shared library, which runs these stages:

1. **compile** — \`circom <name>.circom --r1cs --wasm --sym -l <repo>/node_modules -o build\`
2. **ptau** — download the Hermez \`powersOfTau28_hez_final_<size>.ptau\` and verify its
   registered blake2b hash (unregistered sizes refuse to build, by design)
3. **setup** — \`snarkjs groth16 setup\` + one contribution → \`circuit_final.zkey\`
4. **export** — verification key JSON + Solidity verifier
5. **assemble** — copy everything into \`circuit_bundle/\` under the canonical file names

The SDK equivalent for stages 2–5 is \`buildCircuitBundle\` from \`@0gzk/sdk/build\`
(the build_circuit MCP tool wraps circom + that call).

## Choosing PTAU_SIZE

| PTAU_SIZE | Max constraints |
| --- | --- |
| 12 | 4,096 |
| 13 | 8,192 |
| 14 | 16,384 |
| 15 | 32,768 |
| 16 | 65,536 |

Pick the smallest size that fits — smaller ptau means faster setup and smaller downloads.
Constraint counts come from the r1cs header (see the catalog's \`constraints.count\`).

## Example inputs

Every repo circuit commits an \`example_input.json\` proving its own schema. Values are
decimal strings for field elements. Anything hash-based (commitments, nullifiers, Merkle
roots) must be derived with the same primitives the circuit uses — use circomlibjs's
Poseidon, as \`circuits/_lib/gen_examples.mjs\` does, rather than inventing numbers.
Example inputs are repo-only: published bundles do not include them.

## Publishing

\`0gzk publish --register\` uploads the \`circuit_bundle/\` tarball to a storage backend and
registers \`(name, version, rootHash, vkeyHash, metadataURI)\` on a CircuitRegistry:

- storage backends: \`0g\` (0G Storage, native on the 0G chains) or \`ipfs\` (Pinata-style)
- registry chains: 0G mainnet (16661), 0G testnet (16602), plus Base / Base Sepolia
- \`circuits/publications.json\` records every publication and feeds the catalog

## Public signal ordering

Groth16 public signals are ordered: **outputs first, then public inputs, each in
metadata declaration order**. When wiring an on-chain verifier, index \`publicSignals\`
accordingly — e.g. with one output and public inputs \`currentYear, minAge\`, the array is
\`[output, currentYear, minAge]\`.
`;
