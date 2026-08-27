#!/usr/bin/env bash
# Build script for the solvency_attestation circuit.
# See circuits/_lib/build_lib.sh for the full pipeline.

set -euo pipefail

CIRCUIT_NAME="solvency_attestation"
# 16 Poseidon openings + 17 Num2Bits(64) compiles to ~4500 constraints.
# snarkjs needs 2**k >= 2 * constraints, so 9000 -> need 2**14.
PTAU_SIZE=14
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# shellcheck source=../_lib/build_lib.sh
source "$SCRIPT_DIR/../_lib/build_lib.sh"

ogzk_build_circuit "$CIRCUIT_NAME" "$PTAU_SIZE" "$SCRIPT_DIR"
