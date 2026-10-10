#!/usr/bin/env bash
#
# Weekly scoreboard harvest, meant for a timer (systemd, launchd, cron).
# Finds RDC uploads missing from the database, reads their scoreboards, and
# saves unapproved draft sessions for review at /admin/submissions.
#
# Config comes from .env.harvester.local at the repo root (gitignored):
#   DATABASE_URL                     where drafts are saved
#   DOCUMENT_INTELLIGENCE_ENDPOINT   Azure scoreboard models
#   DOCUMENT_INTELLIGENCE_API_KEY
#   SHEET_ID, GCP_SA_KEY             the "Truth" sheet (same as /api/sheets)
#   RESEND_API_KEY, HARVEST_REPORT_TO (optional) email the run report
#
# Extra args are passed through, e.g. `run-weekly.sh --limit 1`.
set -euo pipefail

cd "$(dirname "$0")/../../.."

# Timers run with a bare environment: pick up pip --user installs (yt-dlp,
# RapidOCR) and nvm's Node.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  source "$HOME/.nvm/nvm.sh" >/dev/null
fi

ENV_FILE="${HARVEST_ENV_FILE:-.env.harvester.local}"
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — see scripts/scoreboard-harvester/README.md" >&2
  exit 1
fi

OUT="${HARVEST_OUT:-$HOME/.cache/rdc-harvester}"
mkdir -p "$OUT/logs"
LOG="$OUT/logs/$(date +%Y-%m-%d_%H%M).log"

pnpm exec tsx --env-file="$ENV_FILE" scripts/scoreboard-harvester/index.ts \
  weekly --write --out "$OUT" "$@" 2>&1 | tee "$LOG"
