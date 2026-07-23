# Current reference map

- `tangle-network/ai-agent-sandbox-blueprint`
  - `sandbox-runtime/src/runtime/mod.rs`: configuration and current record
  - `sandbox-runtime/src/operator_api/`: authenticated operator routes
  - `sandbox-runtime/src/session_auth/`: wallet/session tokens
  - `sandbox-runtime/src/circuit_breaker.rs`: sidecar circuit breaker
  - `ai-agent-sandbox-blueprint-lib/src/lib.rs`: current job IDs/router
  - `ai-agent-sandbox-blueprint-bin/src/main.rs`: production startup
  - `contracts/src/`: service-manager contracts
  - `packages/agent-ui/`: sandbox UI package
- `tangle-network/ai-trading-blueprint`: specialized multi-operator reference
- `tangle-network/openclaw-sandbox-blueprint`: embedded UI reference
- `tangle-network/microvm-blueprint`: minimal lifecycle reference

Inspect these files at the target commit before copying fields, routes,
timeouts, environment variables, or ABI. Keep stable architecture in the skill
and volatile implementation facts in source/tests.
