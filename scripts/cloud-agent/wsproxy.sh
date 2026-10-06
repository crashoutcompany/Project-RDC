#!/usr/bin/env bash
# Deprecated: the Neon-compatible proxy now runs from .cursor/dev.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec node "${REPO_ROOT}/.cursor/dev/neon-local-proxy.mjs"
