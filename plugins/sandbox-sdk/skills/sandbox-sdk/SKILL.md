---
name: sandbox-sdk
description: Use when working on the dev-container sandbox stack itself: orchestrator sidecars, sidecar backend wiring, SDK provider integration, native Codex or Claude Code backends, CLI OAuth credential materialization, or request/env/config plumbing across the sandbox runtime.
---

# Sandbox SDK

Use this skill when the task is about how agents run inside the dev-container sandbox system, not when only app-level prompting or UI behavior changes.

## What This Skill Covers

- Orchestrator sidecar provisioning
- Sidecar backend selection and initialization
- SDK provider plumbing
- Native `codex` and `claude-code` sandbox backends
- CLI OAuth auth-file handling inside the sandbox user home
- Shared request/config/schema changes that must stay consistent across the stack

## Runtime Model

Treat the sandbox as the real runtime:

1. Caller app sends backend config to orchestrator.
2. Orchestrator provisions or reuses a sidecar.
3. Orchestrator passes backend config into the sidecar environment or request payload.
4. Sidecar resolves backend config during bootstrap/session creation.
5. Sidecar initializes the backend and provider adapter.
6. CLI auth files are materialized under sandbox `HOME` before CLI execution.

Do not assume host paths or host auth state are visible inside the sandbox.

## Current Critical Files

- Shared provider contract:
  - `packages/agent-interface/src/index.ts`
  - `packages/sdk-provider-cli-base/src/types.ts`
  - `packages/sdk-provider-cli-base/src/base-adapter.ts`
- Orchestrator:
  - `apps/orchestrator/src/routes/sidecars.ts`
  - `apps/orchestrator/src/orchestrator/project-manager.ts`
  - `apps/orchestrator/src/project/types.ts`
  - `apps/orchestrator/src/schemas/agent-request.ts`
- Sidecar:
  - `apps/sidecar/src/config/backend-config.ts`
  - `apps/sidecar/src/agents/bootstrap.ts`
  - `apps/sidecar/src/routes/agents-sessions.ts`
  - `apps/sidecar/src/routes/agents-config.ts`
  - `apps/sidecar/src/backends/sdk-backend.ts`
  - `apps/sidecar/src/backends/backend-manager.ts`
  - `apps/sidecar/src/backends/cli-auth.ts`
  - `apps/sidecar/src/schemas/agent-request.ts`
  - `apps/sidecar/src/schemas/agent-schemas.ts`
- Provider-specific types:
  - `packages/sdk-provider-codex/src/types.ts`
  - `packages/sdk-provider-claude-code/src/types.ts`

## Rules

1. Keep backend config explicit.
- Backend type, model, auth mode, and auth payloads should be visible in code and easy to trace.

2. Prefer one shared contract.
- If a field like `authMode` or `authFiles` is added, propagate it through shared types and schemas instead of inventing backend-specific ad hoc shapes.

3. Materialize CLI OAuth inside sandbox `HOME`.
- Codex OAuth auth belongs under `.codex/...`.
- Claude Code OAuth auth belongs under `.claude/...`.
- Do not confuse provider session-persistence directories with CLI auth directories.

4. Avoid host-only assumptions.
- Paths like `/opt/homebrew/bin/codex` are usually wrong inside sidecars unless the image actually contains them.

5. Keep backend reuse auth-aware.
- If auth payloads differ, backend instances should not be reused as if they were equivalent.

## Native CLI OAuth Shape

Use this request model for native sandbox backends:

- Codex:
  - `backend.type = "codex"`
  - `backend.model.model = "gpt-5"`
  - `backend.model.authMode = "oauth"`
  - `backend.model.authFiles = [{ path: ".codex/auth.json", content: "..." }]`

- Claude Code:
  - `backend.type = "claude-code"`
  - `backend.model.authMode = "oauth"`
  - `backend.model.authFiles = [...]` mirroring the needed files under `.claude/...`

If API-key mode is intended, pass `apiKey` and set `authMode = "api-key"` explicitly when needed.

## Required Change Pattern

When modifying sandbox backend configuration, check these layers in order:

1. Shared type contract
- `agent-interface`
- shared CLI base types

2. Orchestrator schema and env propagation
- sidecar start route
- project provisioning env builder

3. Sidecar schema and env loading
- request schemas
- backend env loader

4. Sidecar runtime resolution
- bootstrap config
- session creation resolution
- config routes if they expose backend state

5. Backend initialization
- `SdkBackend`
- backend reuse/config matching
- provider-specific config typing

6. Focused tests
- auth-file parsing/materialization
- bootstrap/env inheritance
- request schema acceptance if the contract changed

## Fast Validation

Use targeted checks first:

```bash
cd apps/sidecar
pnpm exec vitest run tests/unit/cli-auth.test.ts tests/unit/backend-config-auth.test.ts
```

For import smoke:

```bash
cd apps/sidecar
pnpm exec tsx --eval "(async () => { await import('./src/config/backend-config.ts'); await import('./src/backends/cli-auth.ts'); await import('./src/agents/bootstrap.ts'); await import('./src/routes/agents-config.ts'); await import('./src/routes/agents-sessions.ts'); console.log('sidecar imports ok'); })()"

cd ../orchestrator
pnpm exec tsx --eval "(async () => { await import('./src/routes/sidecars.ts'); await import('./src/orchestrator/project-manager.ts'); console.log('orchestrator imports ok'); })()"
```

If package-wide typecheck is already red for unrelated reasons, do not hide that. State it explicitly and validate the touched path with focused tests.
