#!/usr/bin/env bash
# Build private_multiply.circom into a 0gzk-publishable bundle.
#
# Steps:
#   1. circom -> r1cs + wasm
#   2. download Powers of Tau ceremony output (cached)
#   3. groth16 setup -> initial zkey
#   4. add one local contribution -> final zkey
#   5. export verification_key.json + verifier.sol
#   6. lay everything out in circuit_bundle/ for `0gzk publish`
#
# Prereqs (you install these once):
#   - circom 2.x      https://docs.circom.io/getting-started/installation/
#   - node            (any recent LTS)
#   - bash + curl     (standard on macOS, Linux, WSL, Git Bash)
#
# This script is intentionally self-contained - it does not source 0gzk's
# private build_lib.sh. Lift it into your own circuit's repo and tweak.

set -euo pipefail

CIRCUIT_NAME="private_multiply"
PTAU_SIZE=12   # 2^12 = 4096 constraints, ample for x*y. Bump for larger circuits.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/build"
BUNDLE_DIR="$SCRIPT_DIR/circuit_bundle"
PTAU_CACHE_DIR="$SCRIPT_DIR/.cache/ptau"
PTAU_FILE="powersOfTau28_hez_final_${PTAU_SIZE}.ptau"
PTAU_URL="https://storage.googleapis.com/zkevm/ptau/${PTAU_FILE}"

mkdir -p "$BUILD_DIR" "$BUNDLE_DIR" "$PTAU_CACHE_DIR"

# 1. Compile circom -> r1cs + wasm
echo "==> [1/6] Compiling $CIRCUIT_NAME.circom"
if ! command -v circom >/dev/null 2>&1; then
    echo "error: circom not on PATH. Install: https://docs.circom.io/getting-started/installation/" >&2
    exit 1
fi
circom "$SCRIPT_DIR/$CIRCUIT_NAME.circom" --r1cs --wasm --sym -o "$BUILD_DIR"

# 2. Powers of Tau (cached, downloaded once)
PTAU_PATH="$PTAU_CACHE_DIR/$PTAU_FILE"
if [ ! -f "$PTAU_PATH" ]; then
    echo "==> [2/6] Downloading Powers of Tau ($PTAU_FILE)"
    curl -fSL --output "$PTAU_PATH.partial" "$PTAU_URL"
    mv "$PTAU_PATH.partial" "$PTAU_PATH"
else
    echo "==> [2/6] Powers of Tau cache hit"
fi

# 3-5. Groth16 setup, contribute, export vkey + Solidity verifier
echo "==> [3/6] groth16 setup"
npx --yes snarkjs groth16 setup \
    "$BUILD_DIR/${CIRCUIT_NAME}.r1cs" \
    "$PTAU_PATH" \
    "$BUILD_DIR/circuit_0000.zkey"

echo "==> [4/6] Contributing to the zkey (non-interactive)"
ENTROPY="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
npx --yes snarkjs zkey contribute \
    "$BUILD_DIR/circuit_0000.zkey" \
    "$BUILD_DIR/circuit_final.zkey" \
    --name="0gzk-example-${CIRCUIT_NAME}" \
    -v -e="$ENTROPY"

echo "==> [5/6] Exporting verification key + Solidity verifier"
npx --yes snarkjs zkey export verificationkey \
    "$BUILD_DIR/circuit_final.zkey" \
    "$BUILD_DIR/verification_key.json"

npx --yes snarkjs zkey export solidityverifier \
    "$BUILD_DIR/circuit_final.zkey" \
    "$BUILD_DIR/verifier.sol"

# 6. Assemble circuit_bundle/ for `0gzk publish`
echo "==> [6/6] Assembling circuit_bundle/"
cp "$BUILD_DIR/${CIRCUIT_NAME}_js/${CIRCUIT_NAME}.wasm" "$BUNDLE_DIR/circuit.wasm"
cp "$BUILD_DIR/circuit_final.zkey"                     "$BUNDLE_DIR/circuit_final.zkey"
cp "$BUILD_DIR/verification_key.json"                  "$BUNDLE_DIR/verification_key.json"
cp "$BUILD_DIR/verifier.sol"                           "$BUNDLE_DIR/verifier.sol"
cp "$SCRIPT_DIR/metadata.json"                         "$BUNDLE_DIR/metadata.json"

echo ""
echo "Done. Bundle ready at $BUNDLE_DIR"
ls -lh "$BUNDLE_DIR"
echo ""
echo "Next step:"
echo "  export OG_PRIVATE_KEY=0x..."
echo "  npx @0gzk/cli publish circuit_bundle --register \\"
echo "    --metadata-uri \"0gzk://${CIRCUIT_NAME}@$(jq -r .version metadata.json 2>/dev/null || echo 0.1.0)\" \\"
echo "    --wait 10m"
