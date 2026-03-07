# Sandbox Blueprint

Build sandbox-style Tangle Blueprints that provision and manage compute instances.

## What It Does

Production-proven patterns for blueprints that manage containers, VMs, or TEE enclaves:

- Crate architecture (runtime / lib / bin separation)
- On-chain job design vs operator API split
- Multi-phase instance provisioning with progress tracking
- Lifecycle state machine with tiered storage (Hot/Warm/Cold/Gone)
- Session auth (EIP-191 + PASETO + scoped sessions)
- Two-phase secret provisioning (on-chain base + off-chain secrets)
- TEE backend abstraction (Phala, AWS Nitro, GCP, Azure, Direct)
- Reaper + tiered garbage collection
- Circuit breaker for sidecar health
- BSM contract patterns with deployment mode flags
- Agent-UI frontend (chat, terminal, sidecar auth, embedded UI)

## Based On

Patterns extracted from production blueprints:
- `ai-agent-sandbox-blueprint` — primary reference
- `ai-trading-blueprints` — specialized DeFi variant
- `openclaw-sandbox-blueprint` — embedded UI variant

## Usage

Automatically triggers when building sandbox-style blueprints, working with container/VM provisioning in Tangle, designing operator APIs for instance management, or using `@tangle-network/agent-ui`.
