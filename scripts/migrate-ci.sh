#!/usr/bin/env bash
# Apply Prisma migrations to the database in DIRECT_URL.
#
# Databases that were created with `prisma db push` (the Neon parent branch and
# production before the baseline) already contain every table from `0_init` but
# have no `_prisma_migrations` table, so `migrate deploy` would try to re-run
# `0_init` and fail. In that one case, mark `0_init` as applied first. Empty
# databases and already-baselined databases go straight to `migrate deploy`.
set -euo pipefail

probe_sql="DO \$\$ BEGIN
  IF to_regclass('public._prisma_migrations') IS NULL
     AND to_regclass('public.players') IS NOT NULL THEN
    RAISE EXCEPTION 'NEEDS_BASELINE';
  END IF;
END \$\$;"

if out="$(printf '%s' "$probe_sql" | pnpm exec prisma db execute --stdin 2>&1)"; then
  :
elif grep -q NEEDS_BASELINE <<<"$out"; then
  echo "Database was created by db push; baselining 0_init"
  pnpm exec prisma migrate resolve --applied 0_init
else
  echo "$out" >&2
  exit 1
fi

pnpm exec prisma migrate deploy
