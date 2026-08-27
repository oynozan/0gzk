#!/usr/bin/env bash
# Build script for the age_verification circuit.
#
# Produces a self-contained circuit_bundle/ via the shared helpers in
# circuits/_lib/build_lib.sh. See that file for the full pipeline (compile,
# fetch ptau with integrity check, groth16 setup + contribute, export
# verification key + Solidity verifier, assemble bundle).
#
# Requirements (must be on PATH): circom (>= 2.1.x), node + npx, curl.
# On Windows: run via git-bash or WSL.

set -euo pipefail

CIRCUIT_NAME="age_verification"
PTAU_SIZE=12
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# shellcheck source=../_lib/build_lib.sh
source "$SCRIPT_DIR/../_lib/build_lib.sh"

ogzk_build_circuit "$CIRCUIT_NAME" "$PTAU_SIZE" "$SCRIPT_DIR"
