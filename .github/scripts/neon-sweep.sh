#!/usr/bin/env bash
# Deletes Neon branches that nothing will clean up on its own:
#   - preview/pr-<N>-*  whose PR is closed, merged or gone. neon-branches.yml
#     deletes these on close, but a close event can be missed (GitHub skips
#     pull_request workflows for PRs with merge conflicts) and a late CI run can
#     recreate a branch afterwards.
#   - ci/e2e-*  throwaway branches from pushes to main that were older than
#     EPHEMERAL_MAX_AGE_HOURS, i.e. their job was killed before its cleanup step.
# Branches of open PRs are never touched, and neither is anything else
# (main, development, hand-made branches).
#
# Needs: NEON_API_KEY, NEON_PROJECT_ID, GH_TOKEN, GH_REPO, neonctl, gh, node.
# DRY_RUN=true only prints what would be deleted.
set -euo pipefail

: "${NEON_PROJECT_ID:?NEON_PROJECT_ID is required}"
: "${GH_REPO:?GH_REPO is required}"
DRY_RUN="${DRY_RUN:-false}"
EPHEMERAL_MAX_AGE_HOURS="${EPHEMERAL_MAX_AGE_HOURS:-6}"

now=$(date +%s)
failed=0
deleted=0

branches=$(neonctl branches list --project-id "$NEON_PROJECT_ID" --output json)

# One "id<TAB>name<TAB>created_at" line per branch.
rows=$(node -e '
  const branches = JSON.parse(require("fs").readFileSync(0, "utf8"));
  for (const b of branches) console.log([b.id, b.name, b.created_at].join("\t"));
' <<<"$branches")

while IFS=$'\t' read -r id name created; do
  [ -n "$id" ] || continue
  case "$name" in
    preview/pr-*)
      number="${name#preview/pr-}"
      number="${number%%-*}"
      [[ "$number" =~ ^[0-9]+$ ]] || continue
      if state=$(gh api "repos/$GH_REPO/pulls/$number" --jq .state 2>&1); then
        :
      elif grep -q 'HTTP 404' <<<"$state"; then
        state=missing
      else
        # A transient API error must never look like "PR is gone".
        echo "::warning::Skipping $name: could not read PR #$number: $state"
        continue
      fi
      [ "$state" = open ] && continue
      reason="PR #$number is $state"
      ;;
    ci/e2e-*)
      age=$((now - $(date -d "$created" +%s)))
      [ "$age" -ge $((EPHEMERAL_MAX_AGE_HOURS * 3600)) ] || continue
      reason="CI throwaway branch is $((age / 3600))h old"
      ;;
    *) continue ;;
  esac

  if [ "$DRY_RUN" = true ]; then
    echo "would delete $name ($id): $reason"
    deleted=$((deleted + 1))
  elif neonctl branches delete "$id" --project-id "$NEON_PROJECT_ID" >/dev/null; then
    echo "deleted $name ($id): $reason"
    deleted=$((deleted + 1))
  else
    echo "::warning::Failed to delete $name ($id): $reason"
    failed=$((failed + 1))
  fi
done <<<"$rows"

echo "Done: $deleted branch(es) $([ "$DRY_RUN" = true ] && echo "would be " )deleted, $failed failed."
[ "$failed" -eq 0 ]
