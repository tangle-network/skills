#!/usr/bin/env bash
# Substrate version check — npm is the source of truth for this adoption skill.
# Run BEFORE copying any version pin or API name out of SKILL.md: the Tangle
# substrate moves fast (agent-eval shipped a breaking 0.94 the same week 0.95
# landed), so a pin in prose goes stale within days. Exits non-zero if any
# version pinned in SKILL.md is behind npm — wire it into CI to fail closed.
set -uo pipefail

skill="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/SKILL.md"
pkgs="agent-eval agent-runtime agent-interface agent-knowledge sandbox agent-profile-materialize"
stale=0

printf '%-44s %-10s %-10s %s\n' PACKAGE NPM SKILL STATUS
for p in $pkgs; do
  npm_v="$(npm view "@tangle-network/$p" version 2>/dev/null || echo '?')"
  # highest x.y pinned for this package anywhere in SKILL.md (handles 0.95.x / >=0.95.0 / @0.95)
  pin="$(grep -oiE "@tangle-network/$p[^0-9]{0,30}[0-9]+\.[0-9]+" "$skill" 2>/dev/null \
        | grep -oE "[0-9]+\.[0-9]+$" | sort -uV | tail -1)"
  st=ok
  if [ -n "$pin" ] && [ "$npm_v" != '?' ] && [ "${npm_v%.*}" != "$pin" ]; then st=STALE; stale=1; fi
  printf '%-44s %-10s %-10s %s\n' "@tangle-network/$p" "$npm_v" "${pin:-—}" "$st"
done

if [ "$stale" = 1 ]; then
  echo
  echo "STALE: a SKILL.md pin is behind npm. Update the pins, then re-verify the API"
  echo "names against the new dist (a minor bump can rename or move an export)."
  exit 1
fi
echo
echo "All pins current against npm."
