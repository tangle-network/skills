#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-verify}"

SKILL_ROOT="/home/drew/.agents/skills/tangle-blueprint-expert"
DOCS_ROOT="/home/drew/.openclaw/workspace/docs"
REF_ROOT="$SKILL_ROOT/references"

FILES=(
  "TANGLE-BLUEPRINT-OVERVIEW.md"
  "TANGLE-BLUEPRINT-BUILD-PROCESS.md"
  "TANGLE-BLUEPRINT-CLI-RUNBOOK.md"
  "TANGLE-BLUEPRINT-LEARNINGS.md"
)

link_one() {
  local file="$1"
  ln -sfn "$DOCS_ROOT/$file" "$REF_ROOT/$file"
}

verify_one() {
  local file="$1"
  local path="$REF_ROOT/$file"
  local target="$DOCS_ROOT/$file"

  if [[ ! -L "$path" ]]; then
    echo "FAIL: $path is not a symlink"
    return 1
  fi

  local resolved
  resolved="$(readlink -f "$path")"
  if [[ "$resolved" != "$target" ]]; then
    echo "FAIL: $path points to $resolved (expected $target)"
    return 1
  fi

  if [[ ! -f "$target" ]]; then
    echo "FAIL: target missing: $target"
    return 1
  fi

  echo "OK: $file"
  return 0
}

case "$MODE" in
  fix)
    for f in "${FILES[@]}"; do
      link_one "$f"
    done
    echo "Symlinks refreshed."
    ;;
  verify)
    for f in "${FILES[@]}"; do
      verify_one "$f"
    done
    ;;
  *)
    echo "Usage: $0 [verify|fix]"
    exit 1
    ;;
esac
