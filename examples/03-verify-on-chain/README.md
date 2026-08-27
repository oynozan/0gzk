# 03 - Verify on chain

Foundry project showing how a Solidity consumer contract calls a 0gzk
Groth16 verifier. Targets `age_verification@0.1.0` (public signals
`[isAdult, currentYear, minAge]`), but the pattern carries over to any 0gzk
circuit - swap the fixed-size arrays for whatever N your circuit produces.

## What's in here

| File | Purpose |
| --- | --- |
| [`src/AgeGate.sol`](./src/AgeGate.sol) | Demo consumer: anyone with a valid `age_verification` proof can mark themselves allowed. |
| [`src/interfaces/IGroth16Verifier.sol`](./src/interfaces/IGroth16Verifier.sol) | snarkjs-style verifier interface, specialized for 3 public signals. |
| [`test/AgeGate.t.sol`](./test/AgeGate.t.sol) | Hermetic Foundry tests using a `MockGroth16Verifier`. No network needed. |
| [`test/MockGroth16Verifier.sol`](./test/MockGroth16Verifier.sol) | Test stub - returns whatever `answer` is set to. |
| [`script/SubmitProof.s.sol`](./script/SubmitProof.s.sol) | Forge script that reads `calldata.json` and calls `AgeGate.claim`. |
| [`scripts/build-calldata.mjs`](./scripts/build-calldata.mjs) | Bridge: snarkjs `proof.json` + `public.json` -> Solidity-friendly `calldata.json`. |

## Run the hermetic tests

```bash
# One-time: pull forge-std
forge install foundry-rs/forge-std --no-commit

# Install the JS-side bits (snarkjs helper)
pnpm install --frozen-lockfile --ignore-workspace

# The smoke
pnpm smoke      # forge test -vv
```

You should see four tests pass: success path, verifier-rejects, not-adult,
event-emitted.

## End-to-end: real proof, real on-chain verification

This example is hermetic by default because the verifier for
`age_verification@0.1.0` is not yet deployed on Galileo (the registry's
`verifier` field is the zero address). To run an actual on-chain
verification you'd deploy the verifier yourself:

1. Use [`01-prove-in-node`](../01-prove-in-node) to generate a proof. It
   writes `proof.json` and `public.json` into a fresh `proof-<timestamp>/`
   directory; the bundle includes a `verifier.sol` you can deploy.

   ```bash
   cd ../01-prove-in-node
   node prove.mjs age_verification 1990    # produces proof-YYYYMMDD-HHMMSS/
   ```

2. Extract + deploy the verifier (this is the step the registry will
   eventually do for you - see [TODO.md open product questions](../../TODO.md#open-product-questions-cross-cutting)):

   ```bash
   # The bundle's verifier.sol is the snarkjs-exported Groth16 contract.
   # Fetch it from 0G Storage or unpack it from the bundle tarball, then:
   forge create Groth16Verifier --rpc-url $OG_RPC_URL --private-key $OG_PRIVATE_KEY --legacy
   # -> outputs DEPLOYED 0x<verifier-address>
   ```

3. Deploy `AgeGate` pointing at that verifier:

   ```bash
   forge create src/AgeGate.sol:AgeGate \
     --constructor-args $VERIFIER \
     --rpc-url $OG_RPC_URL --private-key $OG_PRIVATE_KEY --legacy
   # -> outputs DEPLOYED 0x<gate-address>
   ```

4. Bridge the proof into calldata:

   ```bash
   cd ../03-verify-on-chain
   node scripts/build-calldata.mjs ../01-prove-in-node/proof-<ts>/proof.json \
                                    ../01-prove-in-node/proof-<ts>/public.json
   # -> writes proof-<ts>/calldata.json
   ```

5. Submit:

   ```bash
   GATE=0x<gate-address> \
   CALLDATA=../01-prove-in-node/proof-<ts>/calldata.json \
     forge script script/SubmitProof.s.sol \
       --rpc-url $OG_RPC_URL --private-key $OG_PRIVATE_KEY --broadcast --legacy
   ```

   If the proof is valid and `isAdult == 1`, `AgeGate.allowed(msg.sender)`
   flips to `true`.

## Adapting for your own circuit

1. Copy [`IGroth16Verifier.sol`](./src/interfaces/IGroth16Verifier.sol) and
   change `uint256[3]` to whatever N your bundle's verifier emits.
2. Update [`AgeGate.sol`](./src/AgeGate.sol)'s public-signal indices to match
   your circuit's `metadata.json` outputs + public inputs (in that order;
   snarkjs concatenates them).
3. Re-run the hermetic test to make sure your indices line up.

The pattern stays the same: `verifier.verifyProof(...)` returns `bool`, your
contract decides what that means for your application.
