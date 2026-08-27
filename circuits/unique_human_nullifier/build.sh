#!/usr/bin/env bash
# Build script for the unique_human_nullifier circuit.
# See circuits/_lib/build_lib.sh for the full pipeline.

set -euo pipefail

CIRCUIT_NAME="unique_human_nullifier"
# Depth-16 Merkle + Poseidon hashing compiles to ~8500 constraints, which
# overflows 2**13 = 8192. Use the next-larger Hermez ptau (16k powers).
PTAU_SIZE=14
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# shellcheck source=../_lib/build_lib.sh
source "$SCRIPT_DIR/../_lib/build_lib.sh"

ogzk_build_circuit "$CIRCUIT_NAME" "$PTAU_SIZE" "$SCRIPT_DIR"
