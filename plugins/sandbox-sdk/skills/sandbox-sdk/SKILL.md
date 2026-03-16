---
name: sandbox-sdk
description: Use when building applications or services on top of the Tangle Sandbox SDK — configuring backends, managing sessions, streaming agent output, integrating providers, adding telemetry, or building new provider adapters.
---

# Sandbox SDK

Use this skill when building applications or services on top of the open-source Sandbox SDK (`@tangle-network/sdk*`, `@tangle-network/agent-interface`). This covers how to configure and use the SDK to connect to agent backends, manage sessions, stream output, collect telemetry, and build new provider adapters.

This is the public SDK surface. For internal orchestrator/driver/deployment infrastructure, see `sandbox-infra` (internal, not published).
For building products that consume the SDK (direct-connect streaming, Cloudflare Workers deployment, token auth), see `sandbox-product`.

## What This Skill Covers

- Configuring and connecting to agent backends (opencode, codex, claude-code, amp, factory-droids)
- Building applications that manage agent sessions (create, fork, execute, stream, shutdown)
- Consuming SSE event streams and processing agent output
- Integrating telemetry (traces, signals, sinks)
- Building new provider adapters using the CLI base class
- Auth configuration (API key vs OAuth) and auth file materialization
- Using SDK transports (fetch, WebSocket, Cloudflare Workers)
- Agent memory, collaboration, and batch execution features

## SDK Package Ecosystem

Published `@tangle-network/*` packages:

| Package | Purpose |
|---------|---------|
| `agent-interface` | Canonical `SdkProviderAdapter` contract and all shared types |
| `sdk` | High-level SDK — type-safe orchestrator and sidecar clients |
| `sdk-core` | Transport interfaces, SSE primitives (`SSEChunkParser`, `parseSSEStream`, `parseSSEData`), auth, cache |
| `sdk-telemetry` | Trace collection, telemetry sinks (Langfuse, OTEL, HTTP, Console), usage tracking |
| `sdk-signals` | External signal collection for trace enrichment (GitHub webhooks) |
| `sdk-provider-cli-base` | Base adapter for CLI-based AI agent providers |
| `sdk-provider-opencode` | OpenCode server-based provider (primary) |
| `sdk-provider-codex` | Codex CLI provider |
| `sdk-provider-claude-code` | Claude Code CLI provider |
| `sdk-provider-amp` | AMP (Sourcegraph) CLI provider |
| `sdk-provider-factory-droids` | Factory Droids CLI provider |
| `sdk-cli-runner` | Generic CLI process spawning with stdin/stdout streaming and JSONL parsing |
| `sdk-session-persistence` | File-based session/message storage for CLI providers without built-in persistence |
| `sdk-memory` | Agent memory system (episodes, patterns, snippets, facts) |
| `sdk-collaboration` | Real-time Yjs/CRDT sync |
| `sdk-batch` | Batch execution primitives for agent task orchestration |
| `sdk-billing` | Usage tracking and credit management |
| `sdk-image-builder` | Chainable image builder for custom sandbox container images |
| `sdk-transport-fetch` | Fetch/SSE transport adapter |
| `sdk-transport-ws` | WebSocket transport adapter |
| `sdk-transport-cf` | Cloudflare Workers transport adapter with Durable Object bridge |

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

### Two Provider Models

**Server-based (OpenCode)**:
- Connects to a running OpenCode HTTP server rather than spawning a CLI process.
- Model overridable per-request (not baked into instance).
- Supports agent profiles (`"opencode:profile-name"`) for configuration presets.
- Primary provider in the ecosystem.
- Package: `sdk-provider-opencode` (~121KB adapter).

**CLI-based (Codex, Claude Code, AMP, Factory Droids)**:
- Inherit from `CliProviderAdapterBase` in `sdk-provider-cli-base`.
- Spawn a CLI process per execution with stdin/stdout streaming.
- JSONL event parsing and transformation.
- One model per instance (model baked into CLI args).

### CLI Provider Base Class

`packages/sdk-provider-cli-base/src/base-adapter.ts` — base for all CLI-based providers.

Subclasses override:
- `buildExecArgs()` — CLI command construction
- `buildExecEnv()` — environment variable setup
- `createEventParser()` — JSONL event transformation
- `mapEventToStreamEvents()` — event mapping to canonical `MessagePartUpdatedEvent`

### Building a New CLI Provider

1. Create `packages/sdk-provider-{name}/` with `src/adapter.ts` and `src/types.ts`.
2. Extend `CliProviderAdapterBase` from `sdk-provider-cli-base`.
3. Define config type extending `CliProviderConfig`.
4. Implement the four override methods above.
5. Register in sidecar's `SDK_PROVIDER_REGISTRY` (`apps/sidecar/src/backends/backend-manager.ts`).

## Backend Types

Five backends registered in `SDK_PROVIDER_REGISTRY` (`apps/sidecar/src/backends/backend-manager.ts`):

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
- **CLI backends**: Cache key = workspace + model + `authFiles` signature (SHA256 hash of paths + content).

If auth payloads differ, backend instances are not reused. Controlled by `configMatches()` in `backend-manager.ts`.

`OPENCODE_BACKEND_PERSIST` env var (default: `true`) keeps OpenCode server alive across sessions via refCount.

## Key Shared Types (`agent-interface`)

### Part Types
- `TextPart` — message text content
- `ToolPart` — tool execution state (pending, running, completed, error)
- `ReasoningPart` — model thinking/reasoning content
- `FilePart` — file references
- `SubtaskPart` — sub-agent spawning
- Union: `type Part = TextPart | ToolPart | ...`

### Stream Events
- `MessagePartUpdatedEvent` — primary event for all part state changes
- Supporting: `tool-heartbeat`, `tool-slow`, `model-processing`, `status`, `warning`, `raw`, `session.updated`, `question`

### Execution Model
- `AgentExecutionInput` — request with message, systemPrompt, sessionId, userId, traceId, headers
- `AgentExecutionResult` — response with text, toolInvocations, reasoning, tokenUsage, timing

### Configuration
- `ProviderConfig` — model (apiKey, baseUrl, authMode, authFiles), server, workspace, metadata, profile
- `CliAuthFile` — auth files to materialize: `{ path: string, content: string, mode?: number }`

### Host Services
- `SdkMemoryHost` — list(), remember(), format()
- `SdkToolHost` — buildPromptBlock(), registerInstruction(), getRegisteredTools()
- `SdkRecorder` — recordUserMessage(), appendAssistantParts(), setSessionId()
- `SdkTraceContext` — addEvent(), addSignal(), complete(), fail(), trackSubAgent()

### MCP Configuration
- `LocalMcpConfig` — stdio-based MCP servers (command, args, env)
- `RemoteMcpConfig` — HTTP-based MCP servers (url, headers)
- `McpServerStatus` — connection status monitoring

### Token Usage and Timing
- `TokenUsage` — inputTokens, outputTokens, cacheReadInputTokens, reasoningTokens, cost
- `ExecutionTiming` — startedAt, completedAt, durationMs

## Session Lifecycle (Sidecar)

1. **HTTP**: POST `/agents/session` validates `CreateSessionRequestSchema` (`routes/agents-sessions.ts`).
2. **Session store**: New `SessionEntry` with UUID, backendType, timestamps. Write-through cache + disk. 24h TTL.
3. **Backend session**: OpenCode gets async retry (5 attempts, 250ms initial backoff). CLI backends return sidecar sessionId directly.
4. **Workspace**: Container mode uses `AGENT_WORKSPACE_ROOT` directly. Local mode uses per-session subdir under `/tmp/agent/workspace/{sessionId}`.
5. **Auth materialization**: `materializeCliAuthFiles()` writes to sandbox HOME with 0o600 permissions. Rejects absolute paths and `../` traversal.

## SSE Streaming

### Primitives (use these, never roll your own)

From `sdk-core`:
- `SSEChunkParser` — stateful chunk accumulator for streaming SSE
- `parseSSEStream()` — async generator for streaming SSE events
- `parseSSEData()` — single event parser

From `sdk-telemetry`:
- `sseToTraceEvent()` — convert SSE event to trace event
- `sseToSignal()` — convert SSE event to outcome signal

Pipeline: `SSE Stream → SSEChunkParser → parseSSEData() → sseToTraceEvent() → TraceEvent`

### Sidecar SSE Implementation

`apps/sidecar/src/routes/agents-stream.ts`:
- SSE headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
- Event format: `event: {type}\ndata: {JSON}\n\n`
- Event buffer (`events/event-buffer-manager.ts`): stores events with auto-replay for late-joining clients
- Metrics: `sidecar_sse_connections_active`, `sidecar_sse_messages_total`, `sidecar_sse_write_failures_total`

## Telemetry

`sdk-telemetry` provides a sink-based architecture:

| Sink | Description |
|------|-------------|
| `LangfuseSink` | Native Langfuse integration (recommended) |
| `OtelTelemetrySink` | OpenTelemetry OTLP backend |
| `HttpTelemetrySink` | Generic HTTP endpoint |
| `ConsoleTelemetrySink` | Debug/logging |
| `MultiTelemetrySink` | Composite sink for multiple backends |

Trace types: `message.part.updated`, `message.updated`, `error`, `custom`
Signals: `build_passed`, `tests_failed`, `user_approved`, `task_completed`, etc.

## Storage and State (Sidecar)

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

## CLI OAuth

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

## Critical Files

### Provider Contract
- `packages/agent-interface/src/index.ts` — SdkProviderAdapter interface, Part types, stream events, HostServices
- `packages/sdk-provider-cli-base/src/types.ts` — CliProviderConfig, CliExecArgs, ExecutionState
- `packages/sdk-provider-cli-base/src/base-adapter.ts` — CLI base class (683 lines)

### Provider Implementations
- `packages/sdk-provider-opencode/src/adapter.ts` — primary provider (~121KB), profiles, MCP
- `packages/sdk-provider-codex/src/types.ts` — CodexConfig, CodexAuthMode
- `packages/sdk-provider-claude-code/src/types.ts` — ClaudeCodeConfig, ClaudeCodeAuthMode

### SDK Core
- `packages/sdk-core/src/sse/` — SSEChunkParser, parseSSEStream, parseSSEData
- `packages/sdk-core/src/transport/` — ConnectionManager, BaseTransportAdapter
- `packages/sdk-core/src/auth/` — token scoping, generation, validation

### Telemetry
- `packages/sdk-telemetry/src/sse-parser.ts` — SSE to trace event conversion
- `packages/sdk-telemetry/src/trace-types.ts` — TraceEvent, Signal types
- `packages/sdk-telemetry/src/sinks/` — Langfuse, OTEL, HTTP, Console sinks

### Sidecar (Runtime)
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
- `apps/sidecar/src/schemas/agent-schemas.ts` — BackendConfigSchema, CreateSessionRequestSchema

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

## Required Change Pattern

When modifying SDK or sidecar backend configuration, check these layers in order:

1. Shared type contract
   - `agent-interface` types
   - shared CLI base types in `sdk-provider-cli-base`

2. Sidecar schema and env loading
   - request schemas (`schemas/agent-schemas.ts`)
   - backend env loader (`config/backend-config.ts`)

3. Sidecar runtime resolution
   - bootstrap config (`agents/bootstrap.ts`)
   - session creation resolution (`agents/run-controller.ts`)
   - workspace resolution (`lib/workspace-resolution.ts`)

4. Backend initialization
   - `SdkBackend` (`backends/sdk-backend.ts`)
   - backend reuse/config matching (`backends/backend-manager.ts`)
   - provider-specific config typing

5. Focused tests
   - auth-file parsing/materialization
   - bootstrap/env inheritance
   - request schema acceptance if the contract changed

## Fast Validation

```bash
cd apps/sidecar
pnpm exec vitest run tests/unit/cli-auth.test.ts tests/unit/backend-config-auth.test.ts
```

Import smoke:

```bash
cd apps/sidecar
pnpm exec tsx --eval "(async () => { await import('./src/config/backend-config.ts'); await import('./src/backends/cli-auth.ts'); await import('./src/agents/bootstrap.ts'); await import('./src/routes/agents-config.ts'); await import('./src/routes/agents-sessions.ts'); console.log('sidecar imports ok'); })()"
```

If package-wide typecheck is already red for unrelated reasons, do not hide that. State it explicitly and validate the touched path with focused tests.
