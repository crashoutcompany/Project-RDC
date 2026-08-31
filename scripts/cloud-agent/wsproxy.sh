#!/usr/bin/env bash
# Runs Neon wsproxy in the foreground (for use as a Cloud Agent `terminal`).
# Fronts the local PostgreSQL instance so the app's Neon serverless driver can
# connect to it. Waits for PostgreSQL to be reachable first.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

for _ in $(seq 1 60); do
  if sudo -u postgres pg_isready -q 2>/dev/null; then break; fi
  sleep 1
done

log "Launching wsproxy on :${WSPROXY_PORT} -> localhost:5432"
exec env LISTEN_PORT=":${WSPROXY_PORT}" ALLOW_ADDR_REGEX=".*" \
  APPEND_PORT="localhost:5432" LOG_TRAFFIC="false" wsproxy
