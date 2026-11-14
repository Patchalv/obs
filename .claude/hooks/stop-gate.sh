#!/usr/bin/env bash
# Stop hook: the quality gate every turn must pass before Claude stops.
#
# Runs tsc -b, Biome, ESLint, Knip, dependency-cruiser, check:terms and `vitest related`
# on the changed files. Skipped when nothing under apps/ or packages/ changed since the
# last passing run. Exit 2 sends the failures back to Claude to fix.
#
# Loop guard: after 3 blocked stops in a row, the gate lets Claude stop and tells the
# user, so an unfixable failure can't keep a session spinning.
set -uo pipefail

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}" || exit 0

input="$(cat)"
session_id="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).session_id??"default")}catch{console.log("default")}})')"
state_dir="${TMPDIR:-/tmp}/ping-stop-gate"
mkdir -p "$state_dir"
fingerprint_file="$state_dir/$session_id.fingerprint"
blocks_file="$state_dir/$session_id.blocks"

untracked() { git ls-files --others --exclude-standard -- apps packages; }

fingerprint() {
  {
    git rev-parse HEAD
    git diff HEAD -- apps packages
    untracked | while IFS= read -r f; do [ -f "$f" ] && shasum "$f"; done
  } | shasum | cut -d' ' -f1
}

current="$(fingerprint)"
if [ -f "$fingerprint_file" ]; then
  [ "$current" = "$(cat "$fingerprint_file")" ] && exit 0
elif [ -z "$(git status --porcelain -- apps packages)" ]; then
  # First stop of the session with a clean tree: nothing this turn to check.
  printf '%s' "$current" >"$fingerprint_file"
  exit 0
fi

block() {
  local count
  count=$(($(cat "$blocks_file" 2>/dev/null || echo 0) + 1))
  printf '%s' "$count" >"$blocks_file"
  if [ "$count" -gt 3 ]; then
    rm -f "$blocks_file"
    printf '{"systemMessage":"Stop gate still failing after 3 attempts; stopping anyway. Run the checks with `pnpm check`."}\n'
    exit 0
  fi
  exit 2
}

if ! docker info >/dev/null 2>&1 || [ -z "$(docker compose ps --status running -q postgres 2>/dev/null)" ]; then
  echo "Stop gate: Docker or the local stack isn't running. Run \`docker compose up -d\`, then try again." >&2
  block
fi

bin=node_modules/.bin
biome_check() { "$bin/biome" check . && node scripts/check-ts-directives.ts; }
failures=""
run_check() {
  local name="$1"
  shift
  local output
  if ! output="$("$@" 2>&1)"; then
    failures+=$'\n'"=== $name failed ==="$'\n'"$(printf '%s' "$output" | tail -40)"$'\n'
  fi
}

base="$(git merge-base HEAD origin/master 2>/dev/null || git rev-parse HEAD)"
changed=()
while IFS= read -r f; do
  [ -f "$f" ] && changed+=("$f")
done < <({ git diff --name-only "$base" -- apps packages; untracked; } | grep -E '\.(ts|tsx)$' | sort -u)

run_check "tsc -b" "$bin/tsc" -b
run_check "Biome" biome_check
run_check "ESLint" "$bin/eslint" .
run_check "Knip" "$bin/knip"
run_check "dependency-cruiser" "$bin/depcruise" apps packages --config .dependency-cruiser.cjs
run_check "check:terms" node scripts/check-terms/cli.ts
if [ "${#changed[@]}" -gt 0 ]; then
  run_check "vitest related" "$bin/vitest" related --run --passWithNoTests "${changed[@]}"
fi

if [ -n "$failures" ]; then
  echo "Stop gate failed. Fix these before finishing:$failures" >&2
  block
fi

rm -f "$blocks_file"
printf '%s' "$current" >"$fingerprint_file"
exit 0
