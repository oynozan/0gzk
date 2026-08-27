#!/usr/bin/env bash
# Build script for the sha256_preimage_short circuit.
# See circuits/_lib/build_lib.sh for the full pipeline.

set -euo pipefail

CIRCUIT_NAME="sha256_preimage_short"
# SHA256 of 256 bits compiles to ~30000 constraints, well above 2**14.
# Use Hermez ptau 16 (65k powers) — a one-time ~30 MB download.
PTAU_SIZE=16
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# shellcheck source=../_lib/build_lib.sh
source "$SCRIPT_DIR/../_lib/build_lib.sh"

ogzk_build_circuit "$CIRCUIT_NAME" "$PTAU_SIZE" "$SCRIPT_DIR"
