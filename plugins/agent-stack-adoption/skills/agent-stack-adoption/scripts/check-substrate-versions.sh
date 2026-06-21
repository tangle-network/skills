#!/usr/bin/env bash
# Substrate version check. npm is the source of truth for this adoption skill.
# Run before copying any version pin or API name out of the skill/reference docs:
# the Tangle substrate moves fast, and minor bumps can move exports.
set -uo pipefail

skill_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
docs=("$skill_dir/SKILL.md")
if [ -d "$skill_dir/references" ]; then
  while IFS= read -r ref; do
    docs+=("$ref")
  done < <(find "$skill_dir/references" -type f -name '*.md' | sort)
fi

pkgs="agent-eval agent-runtime agent-interface agent-knowledge agent-profile-materialize sandbox tcloud traces"
stale=0

printf '%-44s %-10s %-10s %s\n' PACKAGE NPM DOCS STATUS
for p in $pkgs; do
  npm_v="$(npm view "@tangle-network/$p" version 2>/dev/null || echo '?')"
  # Highest x.y pin for this package anywhere in the skill docs. Handles
  # 0.95.x, >=0.95.0, ^0.95.0, and table-form references.
  pin="$(grep -hoiE "@tangle-network/$p[^0-9]{0,120}[0-9]+\.[0-9]+" "${docs[@]}" 2>/dev/null \
        | grep -oE "[0-9]+\.[0-9]+$" | sort -uV | tail -1)"
  st=ok
  if [ -n "$pin" ] && [ "$npm_v" != '?' ] && [ "${npm_v%.*}" != "$pin" ]; then
    st=STALE
    stale=1
  fi
  printf '%-44s %-10s %-10s %s\n' "@tangle-network/$p" "$npm_v" "${pin:-n/a}" "$st"
done

if [ "$stale" = 1 ]; then
  echo
  echo "STALE: a skill doc pin is behind npm. Update the pins, then re-verify"
  echo "the API names against the new package dist before copying guidance."
  exit 1
fi

echo
echo "All documented pins current against npm."
