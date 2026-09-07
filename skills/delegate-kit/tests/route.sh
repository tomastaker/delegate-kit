#!/usr/bin/env bash
# Deterministic routing, adapter and lifecycle contracts; no model calls.
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
node --test "$HERE/routing.test.mjs" "$HERE/adapters.test.mjs" "$HERE/install.test.mjs"
