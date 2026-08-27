#!/usr/bin/env bash
# Build script for the merkle_membership circuit.
# See circuits/_lib/build_lib.sh for the full pipeline.

set -euo pipefail

CIRCUIT_NAME="merkle_membership"
# Depth-8 Poseidon Merkle membership compiles to ~4160 constraints, which
# overflows 2**12 = 4096. Use the next-larger Hermez ptau (8k powers).
PTAU_SIZE=13
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# shellcheck source=../_lib/build_lib.sh
source "$SCRIPT_DIR/../_lib/build_lib.sh"

ogzk_build_circuit "$CIRCUIT_NAME" "$PTAU_SIZE" "$SCRIPT_DIR"
