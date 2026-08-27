# private_balance_threshold

Proves a private balance is at least a public threshold, anchored to a public
`Poseidon([balance, salt])` commitment. Useful for zkKYC-style flows where an
attestation service publishes the commitment and the user later proves "above
X" without revealing the exact balance.

The committed `example_input.json` carries `commitment: "0"` as a placeholder.
Compute a real one with `derive_input.mjs`:

```bash
bash build.sh
node derive_input.mjs                       # balance=1_000_000, salt=12345, threshold=100_000
node derive_input.mjs 5000000 99 250000     # custom values

0gzk prove --bundle ./circuit_bundle ./example_input.json
```
