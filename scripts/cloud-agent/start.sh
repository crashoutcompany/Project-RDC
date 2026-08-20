#!/usr/bin/env bash
# Cursor Cloud Agent `start` phase (attached).
#
# Brings up the local database and wsproxy, then runs the Next.js dev server in
# the foreground so it stays attached for the lifetime of the container.
# All steps are idempotent and tolerate restarts.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

cd "${REPO_ROOT}"

ensure_postgres
ensure_role_db
write_env_files
ensure_wsproxy

log "Starting Next.js dev server on http://localhost:3000"
exec npm run dev
