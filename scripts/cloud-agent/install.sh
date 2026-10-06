#!/usr/bin/env bash
# Deprecated path: Cloud Agent bootstrap now lives in .cursor/dev.
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
exec bash "${REPO_ROOT}/.cursor/dev/install.sh"
