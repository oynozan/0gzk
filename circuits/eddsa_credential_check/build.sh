#!/usr/bin/env bash
# Build script for the eddsa_credential_check circuit.
# See circuits/_lib/build_lib.sh for the full pipeline.

set -euo pipefail

CIRCUIT_NAME="eddsa_credential_check"
# EdDSAPoseidonVerifier + 2 Poseidon hashes compiles to ~9120 constraints.
# snarkjs requires 2**k >= 2 * constraints, so 18240 -> need 2**15.
PTAU_SIZE=15
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# shellcheck source=../_lib/build_lib.sh
source "$SCRIPT_DIR/../_lib/build_lib.sh"

ogzk_build_circuit "$CIRCUIT_NAME" "$PTAU_SIZE" "$SCRIPT_DIR"
