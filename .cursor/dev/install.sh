#!/usr/bin/env bash
# One-time, idempotent Cloud Agent install. Safe to run repeatedly.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"
cd "$REPO_ROOT"

log "Ensuring hosts, Postgres, certificates, and .env"
ensure_hosts
ensure_postgres
ensure_role_db
ensure_certs
write_env_files

log "Installing dependencies (app + proxy)"
pnpm install --frozen-lockfile --ignore-scripts
( cd "$DEV_DIR" && pnpm install )

set -a
# shellcheck disable=SC1091
source "${REPO_ROOT}/.env"
set +a
export NODE_EXTRA_CA_CERTS="$CERT_DIR/ca.crt"

log "Syncing Prisma schema"
pnpm exec prisma db push
pnpm exec prisma generate --sql

start_proxy_for_seed
trap 'kill "$PROXY_PID" 2>/dev/null || true' EXIT

PLAYER_COUNT="$(sudo -u postgres psql -tAd "${DB_NAME}" -c "SELECT count(*) FROM players" 2>/dev/null || echo 0)"
if [ "${PLAYER_COUNT:-0}" = "0" ]; then
  log "Seeding database"
  node --conditions=react-server --import tsx prisma/seed.ts
else
  log "Database already seeded (${PLAYER_COUNT} players); skipping seed."
fi

kill "$PROXY_PID" 2>/dev/null || true
trap - EXIT
log "Install complete."
