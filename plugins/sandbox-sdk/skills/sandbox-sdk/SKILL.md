---
name: sandbox-sdk
description: Use when working on the dev-container sandbox stack itself: orchestrator, sidecar, drivers, SDK providers, session gateway, storage, CLI OAuth, compliance testing, or request/env/config plumbing across the sandbox runtime.
---

# Sandbox SDK

Use this skill when the task is about how agents run inside the dev-container sandbox system, not when only app-level prompting or UI behavior changes.

## What This Skill Covers

- Orchestrator sidecar/project provisioning and lifecycle
- Driver system (local, docker, host-agent, firecracker, tangle)
- Sidecar backend selection, initialization, and caching
- SDK provider architecture and the `SdkProviderAdapter` contract
- All five backends: opencode (primary), codex, claude-code, amp, factory-droids
- CLI OAuth auth-file materialization inside sandbox HOME
- Session gateway and SSE event routing
- Storage orchestration and workspace persistence
- Driver compliance testing harness
- Shared request/config/schema changes across the stack

## Runtime Model

Treat the sandbox as the real runtime:

1. Caller app sends backend config to orchestrator.
2. Orchestrator selects a driver (local, docker, host-agent, firecracker, tangle).
3. Orchestrator provisions or reuses a sidecar container/VM.
4. Orchestrator converts backend config into environment variables and passes to driver.
5. Driver launches container with env vars. Environment precedence: `systemEnv > backendEnv > user.env`.
6. Sidecar resolves backend config during bootstrap/session creation.
7. Sidecar initializes the backend via `BackendManager` and provider adapter registry.
8. CLI auth files are materialized under sandbox `HOME` before CLI execution.
9. Session gateway routes SSE events from sidecar back to SDK clients.

Do not assume host paths or host auth state are visible inside the sandbox.

## Backend Types

Five backends in the `SDK_PROVIDER_REGISTRY` (`apps/sidecar/src/backends/backend-manager.ts`):

| Backend | Provider | Type | Notes |
|---------|----------|------|-------|
| `opencode` | `OpencodeProviderAdapter` | Server-based | Primary. Model overridable per-request. Supports profiles. |
| `codex` | `CodexProviderAdapter` | CLI-based | Inherits `CliProviderAdapterBase`. |
| `claude-code` | `ClaudeCodeProviderAdapter` | CLI-based | Inherits `CliProviderAdapterBase`. |
| `amp` | `AmpProviderAdapter` | CLI-based | Sourcegraph AMP. |
| `factory-droids` | `FactoryDroidsProviderAdapter` | CLI-based | Factory Droids. |

Profile-based format: `"opencode:profile-name"` (e.g., `"opencode:with-web-search"`, `"opencode:full-mcp-stack"`).

### Backend Caching Strategy

Backend instances are cached by key to enable reuse across sessions:

- **OpenCode**: Cache key = workspace + profile name. Model is **excluded** (overridable per-request via API).
- **CLI backends** (codex, claude-code, amp, factory-droids): Cache key = workspace + model + `authFiles` signature (SHA256 hash of paths + content).

If auth payloads differ, backend instances are not reused. Controlled by `configMatches()` in `backend-manager.ts`.

`OPENCODE_BACKEND_PERSIST` env var (default: `true`) keeps OpenCode server alive across sessions via refCount.

## Driver System

Five drivers behind a unified `ContainerDriver` interface (`apps/orchestrator/src/driver/interface/types.ts`):

| Driver | File | Description |
|--------|------|-------------|
| `local` | `driver/local.ts` | Runs sidecar as Node.js process. No Docker. |
| `docker` | `driver/docker.ts` | Docker containers with layered Dockerfile builds. |
| `host-agent` | `driver/host-agent.ts` | Proxies to remote Docker daemons via host-agent HTTP API. Multi-host. |
| `firecracker` | `driver/firecracker/index.ts` | Firecracker microVMs. Snapshots, vsock, TAP networking. |
| `tangle` | `driver/tangle/index.ts` | On-chain job submission to ai-agent-sandbox-blueprint. Chain is source of truth. |

**Factory**: `createDriver()` in `driver/factory.ts` instantiates based on `config.driver.type`.

### ContainerDriver Interface

Key methods:
- `createContainer(config: ContainerConfig)` → `ContainerInstance`
- `startContainer(id)` / `stopContainer(id)` / `removeContainer(id)`
- `getContainer(id)` / `listContainers(filter)`
- `healthCheck()` → `DriverHealth`
- Optional: `selectHost()`, `releaseHost()`, `getContainerEndpointFast()`, `cleanContainerWorkspace()`

### Driver Capabilities (API)

Exposed at `/drivers` route (`apps/orchestrator/src/routes/drivers.ts`):

```
suspend, snapshots, volumes, networks, multiHost, userManagement, metrics, migration
```

These are **runtime capabilities**, not the test-time config flags (`supportsStartStop`, `createStartsContainer`, etc.) which are test configuration overrides in `tests/helpers/driver-test-suites/types.ts`.

### ContainerConfig

Key fields (`driver/interface/types.ts`):
- `env: Record<string, string>` — merged environment variables
- `resources: ResourceLimits` — cpu, memory, disk, pids
- `security: SecurityOptions` — readOnly, noNewPrivileges, user, capabilities
- `git?` — repository cloning with sparse checkout
- `tee?: TeeConfig` — trusted execution (none | tdx | nitro | sev)

## Provider Architecture

All providers implement `SdkProviderAdapter` from `packages/agent-interface/src/index.ts`:

```typescript
interface SdkProviderAdapter {
  getCapabilities(): BackendCapabilities;
  initialize(config: ProviderConfig): Promise<void>;
  createSession(): Promise<string>;
  forkSession?(sessionId: string): Promise<string>;
  execute(input: AgentExecutionInput, services: HostServices, onEvent: EventCallback): Promise<AgentExecutionResult>;
  shutdown(): Promise<void>;
  healthCheck(): Promise<HealthStatus>;
  getMessages(sessionId: string): Promise<Message[]>;
  // Optional: addMcp(), getMcpStatus(), ensureMcps(), updateConfig(), submitQuestionAnswer()
}
```

### CLI Provider Base Class

`packages/sdk-provider-cli-base/src/base-adapter.ts` — 683-line base for CLI-based providers.

Subclasses override:
- `buildExecArgs()` — CLI command construction
- `buildExecEnv()` — environment variable setup
- `createEventParser()` — JSONL event transformation
- `mapEventToStreamEvents()` — event mapping

### Key Shared Types (`agent-interface`)

- **Parts**: `TextPart`, `ToolPart`, `ReasoningPart`, `FilePart`, `SubtaskPart`
- **Stream events**: `MessagePartUpdatedEvent` (primary), `tool-heartbeat`, `status`, `question`
- **Execution**: `AgentExecutionInput` (message, systemPrompt, sessionId, traceId), `AgentExecutionResult` (text, toolInvocations, tokenUsage, timing)
- **Config**: `ProviderConfig` (model, server, workspace, metadata, profile), `CliAuthFile` (path, content, mode)

## Session Gateway

`apps/orchestrator/src/session-gateway/index.ts` — routes SSE events from sidecars to SDK clients.

- Requires `getProductAuthInfo(productId)` for token validation
- Validates session tokens to prevent cross-session event leakage
- Event types: `agent.event`, `container.ready`, `container.removed`, `port.opened`

## Session Lifecycle (Sidecar)

1. **HTTP**: POST `/agents/session` validates `CreateSessionRequestSchema` (`routes/agents-sessions.ts`)
2. **Session store**: New `SessionEntry` with UUID, backendType, timestamps. Write-through cache + disk. 24h TTL.
3. **Backend session**: OpenCode gets async retry (5 attempts). CLI backends return sidecar sessionId directly.
4. **Workspace**: Container mode uses `AGENT_WORKSPACE_ROOT` directly. Local mode uses per-session subdir under `/tmp/agent/workspace/{sessionId}`.
5. **Auth materialization**: `materializeCliAuthFiles()` writes to sandbox HOME with 0o600 permissions. Rejects absolute paths and `../` traversal.

## Storage and State

```
{AGENT_WORKSPACE_ROOT}/
├── .sidecar/
│   └── state/              (STORAGE_PATH, default: {root}/.sidecar/state)
│       ├── sessions/       (session store, write-through cache)
│       ├── messages/       (message query layer)
│       └── buffers/        (event replay buffers)
├── .codex/auth.json        (CLI OAuth, materialized at runtime)
├── .claude/                (Claude Code OAuth)
└── [user project files]
```

- **Session store** (`agents/session-store.ts`): Maps sidecar sessionId → backend sessionId, user ID, metadata. Persisted to disk.
- **Message store** (`storage/message-store.ts`): Backend-agnostic query layer. Backends own message storage.
- **Event buffer** (`events/event-buffer-manager.ts`): In-memory + disk with replay for late-joining SSE clients.
- **Workspace resolution** (`lib/workspace-resolution.ts`): Single source of truth for workspace path computation.

## Orchestrator Subsystems

Beyond sidecar provisioning, the orchestrator manages:

- **Project manager** (`orchestrator/project-manager.ts`): Projects = containers + storage + networking. Statuses: provisioning, ready, degraded, suspended, failed.
- **Health monitoring** (`orchestrator/index.ts`): Background check every 30s. Auto-restarts crashed containers.
- **Container pool** (`services/container-pool.ts`): Pre-warmed containers for fast startup.
- **Storage orchestrator** (`storage/storage-orchestrator.ts`): XFS volumes with quota, S3 snapshots (restic-based), BYOS3.
- **Credential provider** (`credentials/`): Validates backend config before creating containers. Three strategies: env, secrets, files.
- **Pangolin networking** (`services/pangolin-lifecycle.ts`): Public tunnel management for preview links and custom domains.
- **Provision progress** (`provisioning/progress.ts`): Steps: match → networking → git → host-select → storage → image → container → health-check → sidecar-ready → workspace.

## SDK Package Ecosystem

35 packages under `packages/`. Key ones for sandbox work:

| Package | Purpose |
|---------|---------|
| `agent-interface` | Canonical `SdkProviderAdapter` contract and shared types |
| `sdk` | High-level SDK — type-safe orchestrator and sidecar clients |
| `sdk-core` | Transport interfaces, SSE primitives (`SSEChunkParser`, `parseSSEStream`, `parseSSEData`) |
| `sdk-telemetry` | Trace collection, telemetry sinks (Langfuse, OTEL, HTTP, Console) |
| `sdk-provider-cli-base` | Base adapter for CLI-based providers |
| `sdk-provider-opencode` | OpenCode server-based provider (primary) |
| `sdk-provider-codex` | Codex CLI provider |
| `sdk-provider-claude-code` | Claude Code CLI provider |
| `sdk-provider-amp` | AMP (Sourcegraph) CLI provider |
| `sdk-provider-factory-droids` | Factory Droids CLI provider |
| `sdk-cli-runner` | Generic CLI process spawning with stdin/stdout streaming |
| `sdk-session-persistence` | File-based session/message storage for CLI providers |
| `sdk-memory` | Agent memory system (episodes, patterns, snippets, facts) |
| `sdk-collaboration` | Real-time Yjs/CRDT sync |
| `sdk-billing` | Usage tracking and credit management |
| `firecracker-runtime` | Firecracker VM runtime support |
| `pangolin-sdk` | Pangolin tunnel integration |

## Current Critical Files

### Shared Provider Contract
- `packages/agent-interface/src/index.ts` — SdkProviderAdapter interface, Part types, stream events
- `packages/sdk-provider-cli-base/src/types.ts` — CliProviderConfig, CliExecArgs
- `packages/sdk-provider-cli-base/src/base-adapter.ts` — CLI base class (683 lines)

### Orchestrator
- `apps/orchestrator/src/routes/sidecars.ts` — sidecar provisioning route, backend env mapping
- `apps/orchestrator/src/orchestrator/project-manager.ts` — project lifecycle
- `apps/orchestrator/src/orchestrator/sidecar-manager.ts` — sidecar create/reuse/health
- `apps/orchestrator/src/orchestrator/container-config.ts` — final container config builder
- `apps/orchestrator/src/project/types.ts` — project types
- `apps/orchestrator/src/schemas/agent-request.ts` — orchestrator request schemas
- `apps/orchestrator/src/driver/factory.ts` — driver factory
- `apps/orchestrator/src/driver/interface/types.ts` — ContainerDriver contract, ContainerConfig
- `apps/orchestrator/src/credentials/` — credential provider system
- `apps/orchestrator/src/session-gateway/index.ts` — SSE event routing

### Sidecar
- `apps/sidecar/src/backends/interface.ts` — BackendType, BackendConfig, AgentBackend interface
- `apps/sidecar/src/backends/backend-manager.ts` — provider registry, caching, config matching
- `apps/sidecar/src/backends/sdk-backend.ts` — SdkBackend initialization, auth materialization
- `apps/sidecar/src/backends/cli-auth.ts` — auth file materialization with path validation
- `apps/sidecar/src/config/backend-config.ts` — env var loading for backend config
- `apps/sidecar/src/agents/bootstrap.ts` — merges env + request overrides into AgentBootstrapConfig
- `apps/sidecar/src/agents/run-controller.ts` — execution entrypoint, session resolution
- `apps/sidecar/src/agents/session-store.ts` — session persistence, write-through cache
- `apps/sidecar/src/lib/workspace-resolution.ts` — single source of truth for workspace paths
- `apps/sidecar/src/routes/agents-sessions.ts` — session CRUD
- `apps/sidecar/src/routes/agents-stream.ts` — SSE streaming
- `apps/sidecar/src/routes/agents-config.ts` — config routes
- `apps/sidecar/src/schemas/agent-request.ts` — sidecar request schemas
- `apps/sidecar/src/schemas/agent-schemas.ts` — BackendConfigSchema, CreateSessionRequestSchema

### Provider-Specific
- `packages/sdk-provider-opencode/src/adapter.ts` — primary provider (~121KB)
- `packages/sdk-provider-codex/src/types.ts` — CodexConfig, CodexAuthMode
- `packages/sdk-provider-claude-code/src/types.ts` — ClaudeCodeConfig, ClaudeCodeAuthMode

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
   - OpenCode: cache key excludes model (overridable per-request). Only apiKey, baseUrl, profile matter.
   - CLI backends: full model + authFiles signature in cache key. Different auth = different instance.

6. SSE primitives must come from `sdk-core` / `sdk-telemetry`.
   - Use `SSEChunkParser`, `parseSSEStream`, `parseSSEData` from `sdk-core`.
   - Use `sseToTraceEvent()`, `sseToSignal()` from `sdk-telemetry`.
   - Never implement custom SSE parsing in runtime or tests.

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

If API-key mode is intended, pass `apiKey` and set `authMode = "api-key"` explicitly.

Auth file materialization (`cli-auth.ts`):
- Resolves runtime HOME: `process.env.HOME || os.homedir()`
- Rejects absolute paths and `../` traversal
- Writes with mode 0o600 (default)
- Logs relative paths only (no secrets in logs)

## Key Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AGENT_BACKEND` | `"opencode"` | Default backend type |
| `OPENCODE_MODEL_PROVIDER` | — | Model provider for OpenCode |
| `OPENCODE_MODEL_NAME` | — | Model name for OpenCode |
| `OPENCODE_API_KEY` | — | API key for OpenCode |
| `CODEX_MODEL` | — | Model for Codex |
| `CODEX_AUTH_MODE` | — | `"api-key"` or `"oauth"` |
| `CODEX_AUTH_FILES_JSON` | — | JSON-stringified auth files |
| `CLAUDE_CODE_AUTH_MODE` | — | `"api-key"` or `"oauth"` |
| `CLAUDE_CODE_AUTH_FILES_JSON` | — | JSON-stringified auth files |
| `AGENT_WORKSPACE_ROOT` | `/tmp/agent/workspace` | Container workspace root |
| `STORAGE_PATH` | `{root}/.sidecar/state` | Session/message/event persistence |
| `OPENCODE_BACKEND_PERSIST` | `true` | Keep OpenCode server alive across sessions |
| `AGENT_AUTO_LOAD_CONTAINER_DOMAINS` | `true` | Auto-load domain context by container type |

## Required Change Pattern

When modifying sandbox backend configuration, check these layers in order:

1. Shared type contract
   - `agent-interface`
   - shared CLI base types

2. Orchestrator schema and env propagation
   - sidecar start route (`routes/sidecars.ts`)
   - credential provider validation (`credentials/`)
   - container config builder (`orchestrator/container-config.ts`)

3. Sidecar schema and env loading
   - request schemas (`schemas/agent-schemas.ts`)
   - backend env loader (`config/backend-config.ts`)

4. Sidecar runtime resolution
   - bootstrap config (`agents/bootstrap.ts`)
   - session creation resolution (`agents/run-controller.ts`)
   - workspace resolution (`lib/workspace-resolution.ts`)
   - config routes if they expose backend state

5. Backend initialization
   - `SdkBackend` (`backends/sdk-backend.ts`)
   - backend reuse/config matching (`backends/backend-manager.ts`)
   - provider-specific config typing

6. Focused tests
   - auth-file parsing/materialization
   - bootstrap/env inheritance
   - request schema acceptance if the contract changed

## Driver Compliance Testing

All five drivers share a compliance harness (`apps/orchestrator/tests/helpers/driver-test-suites/`).

### Runner

`compliance-runner.ts` → `runDriverComplianceSuites(context, options)` runs four suites:
1. `createLifecycleTests()` — create/start/stop/remove lifecycle
2. `createErrorRecoveryTests()` — error handling and recovery
3. `createConcurrentOperationsTests()` — parallel container operations
4. `createHealthCheckTests()` — health monitoring

### Test Context

```typescript
{
  createDriver: () => ContainerDriver;  // fresh driver per test
  driverName: string;
  cleanup: () => Promise<void>;
  skipReasons?: {
    lifecycle?: string;
    errorRecovery?: string;
    concurrentOperations?: string;
    healthChecks?: string;
  };
}
```

### Environment Gates

| Variable | Gates |
|----------|-------|
| `RUN_DRIVER_COMPLIANCE_TESTS=true` | All compliance suites |
| `RUN_DOCKER_INTEGRATION_TESTS=true` | Docker-specific tests |
| `RUN_TANGLE_E2E=true` | Tangle tests |
| `RUN_TANGLE_E2E_MUTATION=true` | Tangle on-chain mutation tests |

### Base Test Classes

`apps/orchestrator/tests/helpers/base-test-classes.ts`:
- `BaseUnitTest` — mock setup/teardown
- `BaseIntegrationTest` — env var management
- `BaseApiTest` — HTTP client + sidecar tracking. Always use `createTestSidecar()` for proper cleanup.

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

For driver compliance:

```bash
cd apps/orchestrator
RUN_DRIVER_COMPLIANCE_TESTS=true pnpm exec vitest run tests/integration/docker-driver-compliance.test.ts
```

If package-wide typecheck is already red for unrelated reasons, do not hide that. State it explicitly and validate the touched path with focused tests.
