# Runtime architecture

## Contents

- Crate boundaries
- Job surface
- Provisioning phases
- Lifecycle and sidecar boundary

## Crate boundaries

Use three layers:

```text
sandbox-runtime/                 reusable compute/operator contracts
<mode>-blueprint-lib/            product jobs, router, state integration
<mode>-blueprint-bin/            environment, manager bridge, background tasks
contracts/                       service-manager contract and hooks
```

Cloud, single-instance, and TEE-instance modes may share the runtime while
keeping mode-specific library/binary pairs.

The runtime owns backend/provider contracts, records, operator API, auth,
storage, reconciliation, cleanup, progress, secrets, metrics, and typed errors.
The blueprint library owns job ABI and handlers. The binary composes the
environment and starts services; it must not absorb runtime business logic.

## Job surface

Current sandbox reference code defines create/delete and workflow
create/trigger/cancel jobs, plus an internal tick job. Import actual IDs and ABI
types from the library; do not copy a two-job `u32` example into new code.

Use on-chain jobs for auditable mutations such as create/delete and workflow
state changes. Use the operator API for exec, prompt, task, files, terminal,
secrets, snapshots, health, status, stop, and resume. Never put a secret or
large operational payload in job calldata.

Every handler must validate caller/service context, parse typed arguments,
perform one idempotent transition, persist state, and return typed output.

## Provisioning phases

Expose phases such as queued, backend selection, image preparation, compute
creation, start, sidecar health, token/auth setup, optional attestation,
persistence, and ready/failed. Store enough state to resume or clean up after a
process crash.

Before provisioning, enforce sandbox count, CPU, memory, disk, and host-memory
budgets. Reject unsupported TEE/security requirements instead of falling back
to an insecure backend.

Generate tokens server-side after the compute identity exists. Persist the
record only with consistent compute, sidecar, lifecycle, resource, snapshot,
and backend metadata. Read the current `SandboxRecord` from
`sandbox-runtime/src/runtime/mod.rs`; its fields are not stable documentation.

## Lifecycle and sidecar boundary

Treat running/stopped plus snapshot/storage state as explicit transitions.
Stop may preserve a local image or remote snapshot; resume restores the best
available authorized tier. Delete and cleanup must be retry-safe.

Sidecar requests carry a per-sandbox bearer token and request ID. Use the
current operator API timeout constants rather than copying operation-specific
values into the skill. Update last activity only on accepted work.

On restart, reconcile persisted records against real compute and sidecar state.
Never trust a record that claims running without probing the backend.
