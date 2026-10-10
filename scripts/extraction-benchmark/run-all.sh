#!/usr/bin/env bash
#
# Stat-reader round: Gemini against the database on the collected sessions,
# 3 passes each, then the cross-session summary. Collections come from
# `collect` (Decisions finds the scoreboards) and must already exist.
# Resumable: rerun after an interruption and it continues.
#
#   scripts/extraction-benchmark/run-all.sh
#   ENV_FILE=.env.other scripts/extraction-benchmark/run-all.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

export PATH="$HOME/.local/bin:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1091
  source "$HOME/.nvm/nvm.sh" >/dev/null
fi

ENV_FILE="${ENV_FILE:-.env.bench.local}"
BENCH_DIR="${BENCH_DIR:-$HOME/ocrbench/experiment}"
TAG="${TAG:-$(date +%Y-%m-%d)}"
REPEATS="${REPEATS:-3}"
bench() { pnpm exec tsx --env-file="$ENV_FILE" scripts/extraction-benchmark/index.ts "$@"; }

DATASETS="rl-s1 rl-s2 rl-s13 mk8-s31 mk8-s17 mk8-s28"
RUNS=""
for dataset in $DATASETS; do
  run="$dataset-$TAG"
  bench run --dataset "$BENCH_DIR/datasets/$dataset/dataset.json" --methods gemini-3.8-flash \
    --repeats "$REPEATS" --run "$run"
  RUNS="${RUNS:+$RUNS,}$run"
done

bench combine --run "$RUNS"
bench summary-collections
