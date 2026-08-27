#!/usr/bin/env bash
# Build script for the private_balance_threshold circuit.
# See circuits/_lib/build_lib.sh for the full pipeline.

set -euo pipefail

CIRCUIT_NAME="private_balance_threshold"
PTAU_SIZE=12
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# shellcheck source=../_lib/build_lib.sh
source "$SCRIPT_DIR/../_lib/build_lib.sh"

ogzk_build_circuit "$CIRCUIT_NAME" "$PTAU_SIZE" "$SCRIPT_DIR"
