#!/usr/bin/env bash
# Cursor Cloud Agent `install` phase: idempotent repository bootstrap.
#
# Prepares the local database, installs dependencies, syncs the Prisma schema,
# generates the TypedSQL client, and seeds baseline data. Safe to run repeatedly.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "${SCRIPT_DIR}/lib.sh"

cd "${REPO_ROOT}"

ensure_postgres
ensure_role_db
write_env_files

log "Installing npm dependencies..."
if [ -f package-lock.json ]; then
  npm ci --ignore-scripts
else
  npm install --ignore-scripts
fi

# Load DATABASE_URL / DIRECT_URL for Prisma + seed.
set -a
# shellcheck disable=SC1091
source "${REPO_ROOT}/.env"
set +a

log "Syncing Prisma schema (db push)..."
npx prisma db push

log "Generating Prisma client (TypedSQL)..."
npx prisma generate --sql

# wsproxy is needed because the seed uses the Neon serverless driver.
ensure_wsproxy

# Seed only when the database is empty, so re-running install is cheap.
PLAYER_COUNT="$(sudo -u postgres psql -tAd "${DB_NAME}" -c "SELECT count(*) FROM players" 2>/dev/null || echo 0)"
if [ "${PLAYER_COUNT:-0}" = "0" ]; then
  log "Seeding database..."
  node --conditions=react-server --import tsx prisma/seed.ts
else
  log "Database already seeded (${PLAYER_COUNT} players); skipping seed."
fi

log "Install complete."
