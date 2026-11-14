#!/usr/bin/env bash
# PostToolUse hook for Edit|Write:
# 1. Biome formats and lints the edited file. Remaining lint errors go back to Claude.
# 2. For files under apps/web/, Impeccable's design detector runs on the same event.
set -uo pipefail

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
cd "$root" || exit 0

input="$(cat)"
file="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).tool_input?.file_path??"")}catch{console.log("")}})')"
[ -n "$file" ] && [ -f "$file" ] || exit 0

status=0
if [ -x node_modules/.bin/biome ]; then
  if ! output="$(node_modules/.bin/biome check --write --no-errors-on-unmatched --files-ignore-unknown=true "$file" 2>&1)"; then
    printf 'Biome found problems in %s:\n%s\n' "$file" "$(printf '%s' "$output" | tail -40)" >&2
    status=2
  fi
fi

relative="${file#"$root"/}"
impeccable="$root/.claude/skills/impeccable/scripts/impeccable"
if [[ "$relative" == apps/web/* ]] && [ -f "$impeccable" ]; then
  printf '%s' "$input" | "$impeccable" hook
fi

exit "$status"
