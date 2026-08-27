# merkle_membership

Proves a private leaf is included in a public Poseidon-2 Merkle tree of depth 8
without revealing the leaf or its path.

The committed `example_input.json` is a stub with `pathElements`, `pathIndices`,
and `root` zeroed out. It documents the schema but cannot satisfy the circuit
on its own — Merkle inputs depend on a concrete tree, so we generate them.

## Build + populate inputs

```bash
bash build.sh                      # compile + trusted setup -> circuit_bundle/
node derive_input.mjs              # leaf=42, position=5 (default)
node derive_input.mjs 1234 17      # custom leaf, custom position
```

`derive_input.mjs` builds a fresh tree of `2^8` deterministic leaves with the
chosen leaf inserted at the requested position, then writes a working
`example_input.json` (`leaf`, `pathElements[8]`, `pathIndices[8]`, `root`).

## Prove

```bash
0gzk prove --bundle ./circuit_bundle ./example_input.json
```
