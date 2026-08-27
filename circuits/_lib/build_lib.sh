# shellcheck shell=bash
# Shared build helpers for 0gzk circuits.
#
# Per-circuit build.sh files set CIRCUIT_NAME and PTAU_SIZE, then call
# `ogzk_build_circuit`. This file is intended to be sourced, not executed
# directly.
#
# Inputs (env vars set by the per-circuit script before sourcing/calling):
#   CIRCUIT_NAME    - basename of the .circom file (e.g. "age_verification")
#   PTAU_SIZE       - powers of tau exponent (12, 13, 14, ...)
#   SCRIPT_DIR      - absolute path of the circuit dir
#
# Outputs:
#   $SCRIPT_DIR/build/                 intermediate artifacts
#   $SCRIPT_DIR/circuit_bundle/        portable bundle ready for `0gzk publish`

# Powers of Tau registry. Add a row when introducing a new PTAU_SIZE.
# Hashes lifted from the official snarkjs README (Hermez ceremony).
ogzk_ptau_url() {
  local size="$1"
  echo "https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_${size}.ptau"
}

ogzk_ptau_blake2b() {
  local size="$1"
  case "$size" in
    # Hashes verified against the Hermez ceremony manifest.
    # Add a row when introducing a new PTAU_SIZE; the build will refuse
    # unknown sizes rather than silently running without integrity check.
    12) echo "ded2694169b7b08e898f736d5de95af87c3f1a64594013351b1a796dbee393bd825f88f9468c84505ddd11eb0b1465ac9b43b9064aa8ec97f2b73e04758b8a4a" ;;
    13) echo "58efc8bf2834d04768a3d7ffcd8e1e23d461561729beaac4e3e7a47829a1c9066d5320241e124a1a8e8aa6c75be0ba66f65bc8239a0542ed38e11276f6fdb4d9" ;;
    14) echo "eeefbcf7c3803b523c94112023c7ff89558f9b8e0cf5d6cdcba3ade60f168af4a181c9c21774b94fbae6c90411995f7d854d02ebd93fb66043dbb06f17a831c1" ;;
    15) echo "982372c867d229c236091f767e703253249a9b432c1710b4f326306bfa2428a17b06240359606cfe4d580b10a5a1f63fbed499527069c18ae17060472969ae6e" ;;
    16) echo "6a6277a2f74e1073601b4f9fed6e1e55226917efb0f0db8a07d98ab01df1ccf43eb0e8c3159432acd4960e2f29fe84a4198501fa54c8dad9e43297453efec125" ;;
    *) return 1 ;;
  esac
}

ogzk_check_prereqs() {
  local circomlib_dir="$1"

  if ! command -v circom >/dev/null 2>&1; then
    echo "error: circom is not installed or not on PATH." >&2
    echo "       Install it from https://docs.circom.io/getting-started/installation/" >&2
    return 1
  fi

  if [ ! -d "$circomlib_dir/circomlib" ]; then
    echo "error: circomlib not found at $circomlib_dir/circomlib" >&2
    echo "       Run 'pnpm install' from the repo root first." >&2
    return 1
  fi
}

ogzk_compile_circom() {
  local circuit_name="$1"
  local script_dir="$2"
  local build_dir="$3"
  local circomlib_dir="$4"

  echo "==> [1/6] Compiling $circuit_name.circom"
  circom "$script_dir/$circuit_name.circom" \
    --r1cs --wasm --sym \
    -l "$circomlib_dir" \
    -o "$build_dir"
}

ogzk_fetch_ptau() {
  local size="$1"
  local cache_dir="$2"

  local ptau_file="powersOfTau28_hez_final_${size}.ptau"
  local ptau_path="$cache_dir/$ptau_file"
  local ptau_url
  ptau_url="$(ogzk_ptau_url "$size")"

  local expected_hash
  if ! expected_hash="$(ogzk_ptau_blake2b "$size")"; then
    echo "error: no blake2b hash registered for ptau size $size; add one to circuits/_lib/build_lib.sh" >&2
    return 1
  fi

  mkdir -p "$cache_dir"
  if [ ! -f "$ptau_path" ]; then
    echo "==> [2/6] Downloading Powers of Tau ($ptau_file)" >&2
    local tmp_ptau="$ptau_path.partial"
    if ! curl -fSL --output "$tmp_ptau" "$ptau_url" >&2; then
      rm -f "$tmp_ptau"
      echo "error: failed to download Powers of Tau from $ptau_url" >&2
      return 1
    fi
    mv "$tmp_ptau" "$ptau_path"
  else
    echo "==> [2/6] Powers of Tau cache hit: $ptau_path" >&2
  fi

  if command -v b2sum >/dev/null 2>&1; then
    local actual_hash
    actual_hash="$(b2sum "$ptau_path" | awk '{print $1}')"
    if [ "$actual_hash" != "$expected_hash" ]; then
      echo "error: Powers of Tau hash mismatch!" >&2
      echo "       expected: $expected_hash" >&2
      echo "       actual:   $actual_hash" >&2
      echo "       Delete $ptau_path and re-run." >&2
      return 1
    fi
    echo "    integrity: blake2b OK" >&2
  else
    echo "    warning: b2sum not installed; skipping ptau integrity check" >&2
  fi

  # Only the path goes to stdout so callers can capture it cleanly.
  echo "$ptau_path"
}

ogzk_groth16_setup() {
  local r1cs="$1"
  local ptau_path="$2"
  local build_dir="$3"

  echo "==> [3/6] Groth16 setup"
  npx --yes snarkjs groth16 setup "$r1cs" "$ptau_path" "$build_dir/circuit_0000.zkey"

  echo "==> [4/6] Contributing to the zkey (non-interactive)"
  local entropy
  entropy="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
  npx --yes snarkjs zkey contribute \
    "$build_dir/circuit_0000.zkey" \
    "$build_dir/circuit_final.zkey" \
    --name="0gzk-bootstrap" \
    -v -e="$entropy"

  echo "==> [5/6] Exporting verification key + Solidity verifier"
  npx --yes snarkjs zkey export verificationkey \
    "$build_dir/circuit_final.zkey" \
    "$build_dir/verification_key.json"

  npx --yes snarkjs zkey export solidityverifier \
    "$build_dir/circuit_final.zkey" \
    "$build_dir/verifier.sol"
}

ogzk_assemble_bundle() {
  local circuit_name="$1"
  local script_dir="$2"
  local build_dir="$3"
  local bundle_dir="$4"

  local wasm="$build_dir/${circuit_name}_js/$circuit_name.wasm"

  echo "==> [6/6] Assembling circuit_bundle/"
  mkdir -p "$bundle_dir"
  cp "$wasm"                                "$bundle_dir/circuit.wasm"
  cp "$build_dir/circuit_final.zkey"        "$bundle_dir/circuit_final.zkey"
  cp "$build_dir/verification_key.json"     "$bundle_dir/verification_key.json"
  cp "$build_dir/verifier.sol"              "$bundle_dir/verifier.sol"
  cp "$script_dir/metadata.json"            "$bundle_dir/metadata.json"

  echo ""
  echo "Done. Bundle ready at:"
  echo "  $bundle_dir"
  ls -la "$bundle_dir"
}

# Top-level entrypoint. Expects:
#   $1 = CIRCUIT_NAME
#   $2 = PTAU_SIZE
#   $3 = SCRIPT_DIR (absolute)
ogzk_build_circuit() {
  local circuit_name="$1"
  local ptau_size="$2"
  local script_dir="$3"

  local repo_root
  repo_root="$( cd "$script_dir/../.." && pwd )"

  local build_dir="$script_dir/build"
  local bundle_dir="$script_dir/circuit_bundle"
  local ptau_cache_dir="$repo_root/.cache/ptau"
  local circomlib_dir="$repo_root/node_modules"

  ogzk_check_prereqs "$circomlib_dir"

  mkdir -p "$build_dir" "$bundle_dir"

  ogzk_compile_circom "$circuit_name" "$script_dir" "$build_dir" "$circomlib_dir"

  local ptau_path
  ptau_path="$(ogzk_fetch_ptau "$ptau_size" "$ptau_cache_dir")"

  ogzk_groth16_setup "$build_dir/${circuit_name}.r1cs" "$ptau_path" "$build_dir"

  ogzk_assemble_bundle "$circuit_name" "$script_dir" "$build_dir" "$bundle_dir"
}
