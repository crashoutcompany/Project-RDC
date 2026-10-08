#!/usr/bin/env bash
# Per-boot service reconciliation. Starts PostgreSQL and prepares networking so
# the Neon-compatible proxy (launched as a terminal) can bind :443. Returns once
# Postgres is ready. Safe to run repeatedly.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Allow unprivileged processes to bind low ports (the proxy listens on :443).
sudo sysctl -w net.ipv4.ip_unprivileged_port_start=443 >/dev/null 2>&1 || true

# Ensure hostname aliases resolve to loopback (idempotent).
for h in db.localtest.me api.localtest.me apiauth.localtest.me; do
  grep -qE "^127\.0\.0\.1[[:space:]]+$h(\$|[[:space:]])" /etc/hosts || \
    echo "127.0.0.1 $h" | sudo tee -a /etc/hosts >/dev/null
done

PG_VERSION="$(ls /etc/postgresql | sort -n | tail -1)"
sudo pg_ctlcluster "$PG_VERSION" main start 2>/dev/null || true

for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q 2>/dev/null; then
    echo "PostgreSQL $PG_VERSION is ready."
    exit 0
  fi
  sleep 1
done

echo "PostgreSQL did not become ready in time." >&2
exit 1
