# circuits/

Reference Circom circuits packaged for 0gzk. Each subdirectory ships:

- a `*.circom` source file
- `metadata.json` with the input/output schema consumed by `@0gzk/sdk`
- `build.sh` — a thin wrapper around the shared helper in `_lib/build_lib.sh`
- `example_input.json` and (where needed) a `derive_input.mjs` to populate it

After `bash build.sh` you get a self-contained `circuit_bundle/` ready for
`0gzk publish`.

## Available circuits

The table below is generated from `circuits/index.json` by `0gzk catalog build`
— do not edit it by hand.

<!-- CATALOG:BEGIN -->

| Circuit | Constraints | Public inputs | Tags | Use case | Published on |
| --- | --- | --- | --- | --- | --- |
| `age_verification` | 14 | currentYear, minAge | identity, age, comparison, kyc | Gate an 18+ product without collecting date of birth | 0g-mainnet, 0g-testnet |
| `anonymous_vote` | 9,273 | votersRoot, ballotId | voting, nullifier, merkle, governance | One-person-one-vote ballots where the voter stays anonymous | — |
| `country_allowlist` | 5,092 | commitment, allowlistRoot | identity, geo, allowlist, merkle, compliance | Prove residency in an allowed country without revealing which one | 0g-mainnet |
| `eddsa_credential_check` | 9,120 | claim, issuerAx, issuerAy, contextId | credential, signature, eddsa, identity | Prove possession of an issuer-signed credential without showing it | — |
| `geofence_proof` | 346 | latMin, latMax, lngMin, lngMax | geo, location, range, privacy | Prove presence inside a geographic bounding box without exact coordinates | — |
| `hidden_bid_validity` | 850 | commitment, minBid, maxBid | auction, bid, range, commitment | Sealed-bid auctions: prove a bid is within bounds without revealing it | — |
| `merkle_membership` | 4,160 | root | merkle, membership, allowlist, poseidon | Prove an address is on an allowlist without revealing which entry | 0g-mainnet, 0g-testnet |
| `poseidon_preimage` | 415 | hash | hash, poseidon, preimage, commitment | Prove knowledge of a committed secret without revealing it | 0g-mainnet, 0g-testnet |
| `private_balance_threshold` | 716 | commitment, threshold | finance, balance, threshold, commitment, kyc | Prove a balance clears a minimum without revealing the amount | 0g-testnet |
| `private_transfer` | 9,253 | root, recipient | payments, transfer, nullifier, poseidon | Shielded value transfer with balance conservation | — |
| `range_proof_64bit` | 582 | commitment | range, comparison, numeric | Prove a committed value fits in 64 bits and within a range | — |
| `sha256_preimage_short` | 31,780 | hashHigh, hashLow | hash, sha256, preimage | Prove knowledge of a SHA-256 preimage without revealing it | — |
| `solvency_attestation` | 9,455 | commitments, threshold | finance, solvency, threshold, attestation | Prove assets exceed liabilities without publishing the books | — |
| `unique_human_nullifier` | 9,252 | humansRoot, appId | identity, sybil, nullifier, personhood | One-account-per-person signups resistant to sybil attacks | 0g-mainnet |

<!-- CATALOG:END -->

All circuits use Groth16 over bn128 and the Hermez `powersOfTau28_hez_final_<n>`
ptau matching each circuit's `PTAU_SIZE`.

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
5. Run `0gzk catalog build` to regenerate `circuits/index.json` and the
   circuit table above.
