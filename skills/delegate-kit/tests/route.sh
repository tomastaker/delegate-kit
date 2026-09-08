#!/usr/bin/env bash
# Deterministic routing, adapter and lifecycle contracts; no model calls.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
cd "$HERE"
node --test ./*.test.mjs
