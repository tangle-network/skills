---
name: sandbox-blueprint
description: Build a sandbox Blueprint covering isolation, jobs, APIs, auth, secrets, and lifecycle.
---

# Sandbox Blueprint

Build the operator infrastructure behind sandbox products. Keep auditable state
mutations on chain and high-volume reads/operational I/O behind the authenticated
operator API.

## Core flow

```text
service request and operator approval
  -> Blueprint Manager starts the assigned service instance
  -> on-chain create job validates caller and records intent
  -> runtime selects backend and provisions compute
  -> sidecar health/auth and durable record become ready
  -> off-chain operator API serves exec/prompt/files/lifecycle
  -> reaper, cleanup, and reconciliation enforce resource policy
```

## Build order

1. Define the runtime/lib/bin/contract boundaries.
2. Classify each operation as on-chain mutation or operator API request.
3. Implement provisioning as observable phases with a persisted record.
4. Add bearer, wallet-session, owner, service, and instance scope checks.
5. Keep secrets out of job calldata and inject them off chain.
6. Implement backend selection, health checks, stop/resume, snapshots, and
   cleanup with idempotent transitions.
7. Run the service under Blueprint Manager in production.
8. Add UI only against the authenticated public operator/sidecar surfaces.

## Read only what the task needs

- For crate boundaries, jobs, provisioning, lifecycle, and sidecar contracts,
  read [runtime-architecture.md](references/runtime-architecture.md).
- For auth, secrets, TEE, API middleware, persistence, cleanup, and metrics,
  read [security-and-operations.md](references/security-and-operations.md).
- For contracts, startup, service lifecycle, and production manager deployment,
  read [contracts-and-deployment.md](references/contracts-and-deployment.md).
- For chat, terminal, session auth, and embedded UI, read
  [agent-ui.md](references/agent-ui.md).
- For current repositories and source locations, read
  [reference-map.md](references/reference-map.md).

## Invariants

- Sandbox identity survives stop/resume, secret injection, and restore.
- Secrets and bearer tokens never enter on-chain calldata.
- Owner/service/instance scope is checked at every protected mutation.
- Backend choice and security requirements cannot silently downgrade.
- Sidecar tokens are generated server-side and compared safely.
- Cleanup transitions are idempotent and never delete user-owned storage.
- Resource admission accounts for host capacity before provisioning.
- Production starts Blueprint Manager, never a hand-run instance binary.
- Volatile field lists, routes, and timeouts come from current source, not a
  copied `SandboxRecord` or endpoint table.

## Completion evidence

- build and tests pass for runtime, library, binary, and contracts;
- a real service request/approval starts the assigned instance;
- create, query, stop, resume, and delete work with scoped auth;
- secrets are absent from chain/job artifacts and survive only intended paths;
- restart reconciliation recovers persisted running/stopped records;
- admission, timeout, cleanup, and circuit-breaker failure tests pass;
- Blueprint Manager logs prove it spawned the service instance;
- UI direct/proxied modes pass against authenticated endpoints.

## Then consider

- Use `tangle-blueprint-expert` when implementing the general SDK, BSM hooks,
  CLI lifecycle, tenancy model, and production-like proof for the blueprint.
- Use `blueprint-frontend` when building a general service/job frontend rather
  than the sandbox-specific agent UI.
- Use `sandbox-product` when consuming the deployed sandbox through the public
  TypeScript SDK.
