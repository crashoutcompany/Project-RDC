#!/usr/bin/env bash
#
# Runs the whole experiment with one set of keys: every stat reader on every
# dataset (3 passes), the scoreboard finder test, and the cross-game summary.
# Resumable: rerun after an interruption and it continues where it stopped.
#
#   scripts/extraction-benchmark/run-all.sh            # uses .env.bench.local
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
bench() { pnpm exec tsx --env-file="$ENV_FILE" scripts/extraction-benchmark/index.ts "$@"; }

bench methods

for dataset in rl-session33 mk8-session41; do
  bench run --dataset "$BENCH_DIR/datasets/$dataset/dataset.json" --run "$dataset-$TAG"
done

bench combine --run "rl-session33-$TAG,mk8-session41-$TAG"

bench finder --dataset "$BENCH_DIR/datasets/rl-session33/dataset.json" \
  --video 'https://www.youtube.com/watch?v=Opw1cTW5Q68'

echo
echo "Results:"
echo "  $BENCH_DIR/runs/rl-session33-$TAG/results.md"
echo "  $BENCH_DIR/runs/mk8-session41-$TAG/results.md"
echo "  $BENCH_DIR/runs/combined.md"
echo "  $BENCH_DIR/finder/rl-session33/finder-results.md"
