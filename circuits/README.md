# circuits/

Reference Circom circuits packaged for 0gzk. Each subdirectory ships:

- a `*.circom` source file
- `metadata.json` with the input/output schema consumed by `@0gzk/sdk`
- `build.sh` — a thin wrapper around the shared helper in `_lib/build_lib.sh`
- `example_input.json` and (where needed) a `derive_input.mjs` to populate it

After `bash build.sh` you get a self-contained `circuit_bundle/` ready for
`0gzk publish`.

## Available circuits

| Circuit                         | Constraints (approx.) | Public inputs            | Use case                                 |
| ------------------------------- | --------------------- | ------------------------ | ---------------------------------------- |
| `age_verification`              | 9                     | currentYear, minAge      | Prove age >= N without revealing DOB     |
| `poseidon_preimage`             | ~250                  | hash                     | Prove knowledge of a Poseidon preimage   |
| `merkle_membership`             | ~2,000                | root                     | Prove leaf inclusion in a depth-8 tree   |
| `private_balance_threshold`     | ~400                  | commitment, threshold    | Prove balance >= threshold (zkKYC shape) |

All four use Groth16 over bn128 and the Hermez `powersOfTau28_hez_final_12` ptau.

## Layout shared between circuits

```
circuits/
  _lib/
    build_lib.sh        # source-only; reused by every circuit's build.sh
  <circuit>/
    <circuit>.circom
    metadata.json
    example_input.json
    derive_input.mjs    # only when example inputs need computation
    build.sh
    build/              # intermediate artifacts (gitignored)
    circuit_bundle/     # publishable bundle (gitignored, keep .published.json)
```

## Add a new circuit

1. Drop `<name>.circom` and `metadata.json` in `circuits/<name>/`.
2. Copy any existing `build.sh` and update `CIRCUIT_NAME` and `PTAU_SIZE`.
3. If the circuit needs more than ~4096 constraints, register a new
   `PTAU_SIZE` row in `_lib/build_lib.sh` with the snarkjs-published blake2b
   hash. Without a registered hash the build refuses to run, by design.
4. Provide a `derive_input.mjs` whenever `example_input.json` cannot be
   hand-written (e.g. anything involving Poseidon).
