#!/usr/bin/env bash
#
# Builds the vision-ocr Swift CLI into ../bin/vision-ocr.
#
# Requires Xcode command line tools (which you already have if you've ever run
# `git` or `swift` on this machine). Outputs a ~200KB static binary.
#
# The binary itself is game-agnostic — it just runs Apple's Vision framework
# on a single image and prints recognized lines as JSON. The game-specific
# keyword matching happens in TypeScript (see pipeline/ocr.ts).
#
set -euo pipefail
cd "$(dirname "$0")"

mkdir -p ../bin

echo "Compiling vision-ocr.swift…"
swiftc -O vision-ocr.swift -o ../bin/vision-ocr

echo "Built: $(cd .. && pwd)/bin/vision-ocr"

# Smoke check: invoke with no args, expect exit code 2 + usage message.
# `set -e` would treat vision-ocr's expected non-zero exit as a failure, so we
# capture the output and exit code separately and assert on both.
set +e
smoke_out="$(../bin/vision-ocr 2>&1)"
rc=$?
set -e
if [ "$rc" -eq 2 ] && echo "$smoke_out" | grep -q "usage:"; then
    echo "Smoke check passed."
else
    echo "WARN: smoke test failed — expected exit 2 + usage message, got exit $rc" >&2
    echo "Got: $smoke_out" >&2
    exit 1
fi
