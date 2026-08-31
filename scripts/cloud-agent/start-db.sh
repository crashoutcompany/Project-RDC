#!/usr/bin/env bash
# Cursor Cloud Agent `start` phase: per-boot service reconciliation.
#
# Starts the local PostgreSQL daemon and ensures the role/database and .env
# files exist. Returns once the database is ready. The long-running wsproxy and
# dev server run as `terminals` (see .cursor/environment.json).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

ensure_postgres
ensure_role_db
write_env_files

log "Database is up and ready."
