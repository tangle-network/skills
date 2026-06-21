#!/usr/bin/env bash
set -euo pipefail

unset FORCE_COLOR
export NO_COLOR=1

packages=(
  @tangle-network/agent-eval
  @tangle-network/agent-runtime
  @tangle-network/agent-interface
  @tangle-network/agent-knowledge
  @tangle-network/agent-profile-materialize
  @tangle-network/sandbox
  @tangle-network/tcloud
  @tangle-network/traces
)

for pkg in "${packages[@]}"; do
  printf '%s\t%s\n' "$pkg" "$(npm view "$pkg" version)"
done
