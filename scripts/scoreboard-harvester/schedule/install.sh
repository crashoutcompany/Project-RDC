#!/usr/bin/env bash
#
# Installs the weekly harvest as a systemd user timer that runs this checkout.
# Run it from the repo root:
#   scripts/scoreboard-harvester/schedule/install.sh
set -euo pipefail

REPO="$PWD"
SCHEDULE="$REPO/scripts/scoreboard-harvester/schedule"
if [ ! -x "$SCHEDULE/run-weekly.sh" ]; then
  echo "Run this from the repo root (expected $SCHEDULE/run-weekly.sh)." >&2
  exit 1
fi

# Fills in @REPO@ line by line. Bash pattern substitution with a quoted
# replacement is literal, so paths containing |, &, \, or / are safe.
render_unit() {
  local template="$1" line
  while IFS= read -r line || [ -n "$line" ]; do
    printf '%s\n' "${line//@REPO@/"$REPO"}"
  done < "$template"
}

UNIT_DIR="$HOME/.config/systemd/user"
mkdir -p "$UNIT_DIR"
render_unit "$SCHEDULE/rdc-harvester.service.in" > "$UNIT_DIR/rdc-harvester.service"
cp "$SCHEDULE/rdc-harvester.timer" "$UNIT_DIR/rdc-harvester.timer"

systemctl --user daemon-reload
systemctl --user enable --now rdc-harvester.timer
echo "Installed for $REPO."
echo "Next run: systemctl --user list-timers rdc-harvester.timer"
echo "Run now:  systemctl --user start rdc-harvester.service"
