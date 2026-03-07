---
name: sandbox-blueprint
description: Use when building a sandbox-style Tangle Blueprint — container/VM provisioning, lifecycle management, operator API, session auth, secret provisioning, sidecar integration, tiered GC, and BSM contracts. Based on the production ai-agent-sandbox-blueprint.
---

# Sandbox Blueprint

Use this skill when building a Tangle Blueprint that provisions and manages sandbox containers or VMs. This captures the production-proven patterns from `ai-agent-sandbox-blueprint` and `ai-trading-blueprints` — the architecture for any blueprint that manages compute instances with sidecars.

For the Rust SDK primitives (Router, TangleLayer, BlueprintRunner), see `tangle-blueprint-expert`.
For the frontend (job submission, operator discovery, agent chat), see `blueprint-frontend`.
For the sandbox SDK packages (providers, sessions, streaming), see `sandbox-sdk`.

## What This Skill Covers

- Crate architecture for sandbox blueprints (runtime / lib / bin separation)
- On-chain job design (what goes on-chain vs operator API)
- Operator API (Axum HTTP alongside on-chain jobs)
- Instance provisioning flow (multi-phase with progress tracking)
- Lifecycle state machine (Running ↔ Stopped, tiered storage)
- Sidecar integration and communication patterns
- Session auth (EIP-191 + PASETO + scoped sessions)
- Two-phase secret provisioning
- TEE backend abstraction
- Reaper and tiered garbage collection
- Circuit breaker for sidecar health
- BSM contract patterns
- Multi-tenancy and tenant isolation
- Metrics and QoS reporting

## Crate Architecture

Sandbox blueprints use a three-layer crate hierarchy:

```
{name}-runtime/          (L1: stable runtime contracts, reusable across blueprints)
  ├── runtime.rs         — container lifecycle, CreateSandboxParams, SandboxRecord
  ├── operator_api.rs    — Axum HTTP router, middleware, rate limiting
  ├── session_auth.rs    — EIP-191 + PASETO session management
  ├── scoped_session_auth.rs — sandbox/instance scope enforcement
  ├── auth.rs            — sidecar bearer token validation
  ├── store.rs           — PersistentStore (JSON filesystem, RwLock)
  ├── reaper.rs          — idle/lifetime enforcement, tiered GC
  ├── circuit_breaker.rs — three-state circuit breaker
  ├── metrics.rs         — atomic counters for telemetry
  ├── provision_progress.rs — multi-phase progress tracking
  ├── secret_provisioning.rs — two-phase secret injection
  ├── contracts.rs       — SandboxProvider + RuntimeAdapter traits
  ├── http.rs            — sidecar HTTP client with auth headers
  ├── tee/               — TEE backend trait + implementations
  ├── firecracker.rs     — Firecracker host-agent integration
  └── error.rs           — typed error taxonomy

{name}-blueprint-lib/    (L2: product-specific job handlers)
  ├── lib.rs             — Router setup, ABI types, job ID constants
  ├── jobs/              — per-job handler functions
  └── state.rs           — product-specific state helpers

{name}-blueprint-bin/    (L3: binary entry point)
  └── main.rs            — BlueprintRunner wiring, background services, startup
```

**Variant pattern**: A single runtime crate can support multiple deployment modes:
- **Cloud mode**: Multi-instance per service, lifecycle via on-chain jobs
- **Instance mode**: Single instance per service, auto-provisioned at startup
- **TEE instance mode**: Instance mode with hardware enclave isolation

Each mode gets its own `lib` + `bin` crate pair sharing the same runtime.

## On-Chain vs Off-Chain Split

**On-chain jobs (state-changing mutations only):**
- Create/delete instances
- Workflow create/trigger/cancel
- Any operation that must be auditable on-chain

**Operator API (everything else):**
- exec, prompt, task, stop, resume
- SSH, terminal, secrets injection
- Snapshot, health checks, status queries
- Instance access and configuration

**Rule**: Jobs mutate state. Reads and operational I/O go through the operator HTTP API. Never put secrets or large payloads in on-chain job calldata.

## Job Handler Pattern

```rust
use blueprint_sdk::Router;
use blueprint_sdk::tangle::layers::TangleLayer;

pub const JOB_CREATE: u32 = 0;
pub const JOB_DELETE: u32 = 1;

pub fn router() -> Router {
    Router::new()
        .route(JOB_CREATE, create_instance.layer(TangleLayer))
        .route(JOB_DELETE, delete_instance.layer(TangleLayer))
}
```

Job handlers extract on-chain arguments via `TangleArg<T>` and return results via `TangleResult<T>`:

```rust
use blueprint_sdk::tangle::extract::{TangleArg, TangleResult, Caller, CallId};
use blueprint_sdk::tangle::layers::TangleLayer;

pub async fn create_instance(
    TangleArg(request): TangleArg<CreateRequest>,
    caller: Caller,
    call_id: CallId,
    context: Context<RuntimeState>,
) -> TangleResult<CreateOutput> {
    // Validate caller is service owner
    // Create container via runtime adapter
    // Track provision progress
    // Return result
    Ok(TangleResult(output))
}
```

ABI types use `sol!` macro for on-chain encoding:

```rust
use alloy_sol_types::sol;

sol! {
    struct CreateRequest {
        string name;
        string image;
        uint64 cpu_cores;
        uint64 memory_mb;
        uint64 disk_gb;
        string metadata_json;
    }

    struct CreateOutput {
        string sandbox_id;
        string sidecar_url;
        string token;
    }
}
```

## Instance Provisioning Flow

Multi-phase provisioning with progress tracking:

1. **Job received**: Validate caller, parse ABI args
2. **Backend selection**: Docker, Firecracker, or TEE based on request metadata
3. **Image pull**: If `SIDECAR_PULL_IMAGE=true` and image not cached
4. **Container create**: Build container config (env, ports, resources, security)
5. **Container start**: Start and wait for sidecar health
6. **Health check**: Verify sidecar responds on HTTP port
7. **Token generation**: 32-byte hex, cryptographically random, server-side only
8. **SSH setup**: If enabled, generate keys and configure
9. **TEE attestation**: If TEE backend, collect attestation document
10. **Record persistence**: Store SandboxRecord to persistent store
11. **Ready**: Return sandbox ID, sidecar URL, token

### Progress Tracking

```rust
// Phases: Queued → ImagePull → ContainerCreate → ContainerStart → HealthCheck → Ready | Failed
// Queryable via operator API: GET /api/provisions/{call_id}
// Polls every 2s from frontend via useProvisionProgress()
```

## Lifecycle State Machine

Two primary states with tiered storage transitions:

```
                   ┌──────────┐
          create → │ Running  │ ← resume (from any tier)
                   └────┬─────┘
                        │ stop (idle timeout / manual / max lifetime)
                        ▼
                   ┌──────────┐
                   │ Stopped  │
                   └────┬─────┘
                        │ GC tiers (automatic)
                        ▼
            Hot (container) ──1d──→ Warm (committed image)
            Warm ──2d──→ Cold (S3 snapshot)
            Cold ──7d──→ Gone (deleted)
```

- **Hot → Warm**: `docker commit` preserves filesystem state
- **Warm → Cold**: TAR upload to S3
- **Cold → Gone**: S3 object deletion
- **Resume**: Restores from whichever tier is available (Hot > Warm > Cold)
- **User BYOS3**: Never deleted by operator GC

### Key Fields on SandboxRecord

```rust
pub struct SandboxRecord {
    pub id: String,
    pub owner: String,                    // immutable after creation
    pub sidecar_url: Option<String>,
    pub token: String,
    pub state: SandboxState,              // Running | Stopped
    pub created_at: i64,
    pub last_activity_at: i64,
    pub max_lifetime_seconds: u64,
    pub idle_timeout_seconds: u64,
    pub cpu_cores: u64,
    pub memory_mb: u64,
    pub disk_gb: u64,
    pub snapshot_image_id: Option<String>,  // Warm tier
    pub snapshot_s3_url: Option<String>,    // Cold tier
    pub tee_deployment_id: Option<String>,
    pub base_env_json: Option<String>,
    pub user_env_json: Option<String>,
}
```

## Sidecar Integration

### Communication Pattern

- Each sandbox gets a unique 32-byte hex bearer token (server-side generated)
- Sidecar calls use `Authorization: Bearer {token}` header
- Token comparison uses constant-time equality (`subtle::ConstantTimeEq`)
- Request correlation via `x-request-id` header (unique per request)

### Per-Operation Timeouts

```rust
const SIDECAR_EXEC_TIMEOUT: Duration = Duration::from_secs(30);
const SIDECAR_AGENT_TIMEOUT: Duration = Duration::from_secs(90);  // LLM inference
const SIDECAR_DEFAULT_TIMEOUT: Duration = Duration::from_secs(60);
```

## Session Auth

Three-tier auth model:

### 1. EIP-191 Challenge-Response

```
Client: POST /api/auth/challenge → { challenge, expires_at }
Client: Signs challenge with wallet (personal_sign)
Client: POST /api/auth/verify → { signature, challenge } → { token, expires_at }
```

- Challenge TTL: 5 minutes
- Session TTL: 1 hour
- Address recovery from ECDSA signature via k256

### 2. PASETO v4.local Session Tokens

- Symmetric encryption with `SESSION_AUTH_SECRET` (32-byte hex, required in production)
- Payload: `{ address, scope, issued_at, expires_at }`
- No database lookup needed — token is self-contained

### 3. Scoped Sessions

- Scopes: `sandbox:{id}` (cloud mode) or `instance:{id}` (instance mode)
- Enforces owner + scope binding: token for sandbox A cannot access sandbox B
- Extracted via middleware on every protected route

## Two-Phase Secret Provisioning

Secrets never appear in on-chain calldata:

**Phase 1** (on-chain): `JOB_CREATE` with `base_env_json` only (non-sensitive config)

**Phase 2** (off-chain): Secrets injected via operator API
- **Standard path**: `POST /api/sandboxes/{id}/secrets` → container recreated with merged env
- **TEE path**: `POST /api/sandboxes/{id}/tee/sealed-secrets` → client encrypts to TEE public key

```
Phase 1: On-chain create → base config only
Phase 2: Off-chain inject → secrets merged, container recreated
```

Key functions: `inject_secrets()`, `wipe_secrets()`, `merge_env_json()`

**Invariant**: Sandbox identity (ID, token) is preserved across secret injection — the container is recreated but the record is the same.

## TEE Backend Abstraction

```rust
pub trait TeeBackend: Send + Sync {
    async fn deploy(&self, params: TeeDeployParams) -> Result<TeeDeployment>;
    async fn attestation(&self, deployment_id: &str) -> Result<TeeAttestation>;
    async fn stop(&self, deployment_id: &str) -> Result<()>;
    async fn destroy(&self, deployment_id: &str) -> Result<()>;
    fn tee_type(&self) -> TeeType;
    // Optional: sealed secrets support
}
```

Backends: `phala` (dstack), `aws_nitro`, `gcp`, `azure`, `direct` (local TDX/SEV)

Selected via `TEE_BACKEND` env var. Backend factory in `tee/backend_factory.rs`.

## Operator API Pattern

Axum-based HTTP server running alongside the BlueprintRunner:

```rust
// In main.rs:
let router = operator_api_router();
let listener = TcpListener::bind((bind_addr, api_port)).await?;
let server = axum::serve(listener, router).with_graceful_shutdown(shutdown_signal());
tokio::spawn(server);
```

### Middleware Stack

1. **Request ID**: Assigns unique `req-{counter:016x}`, propagates via task-local
2. **Security headers**: X-Content-Type-Options, X-Frame-Options, Cache-Control, HSTS
3. **Rate limiting**: Sliding window per IP
   - Auth endpoints: 10 req/min
   - Read endpoints: 120 req/min
   - Write endpoints: 30 req/min
4. **Session auth**: PASETO token extraction + scope validation

### Route Structure

```
/api/auth/challenge          POST   — request EIP-191 challenge
/api/auth/verify             POST   — exchange signature for session token
/api/sandboxes               GET    — list sandboxes (owner-filtered)
/api/sandboxes/{id}          GET    — sandbox details
/api/sandboxes/{id}/secrets  POST   — inject secrets (phase 2)
/api/sandboxes/{id}/stop     POST   — stop sandbox
/api/sandboxes/{id}/resume   POST   — resume from any tier
/api/provisions/{call_id}    GET    — provision progress
/api/health                  GET    — operator health
```

## Reaper and Garbage Collection

Two background loops:

### Reaper (every 30s)

Enforces timeouts on running sandboxes:
- **Idle timeout**: No activity for `idle_timeout_seconds` → soft stop
- **Max lifetime**: Running longer than `max_lifetime_seconds` → hard delete
- Pre-stop: docker commit + optional S3 snapshot upload

### GC (every 1h)

Tiered demotion of stopped sandboxes:

| Transition | Retention | Action |
|------------|-----------|--------|
| Hot → Warm | 1 day | `docker commit` (preserve filesystem) |
| Warm → Cold | 2 days | TAR upload to S3 |
| Cold → Gone | 7 days | S3 object delete |

User BYOS3 snapshots are never deleted (distinguished via `SANDBOX_SNAPSHOT_DESTINATION_PREFIX`).

### Session GC (every 5 min)

Cleans expired PASETO challenges and session tokens.

## Circuit Breaker

Three-state circuit breaker per sandbox for sidecar health:

```
Closed (healthy) → Open (failed, cooldown) → Half-Open (probe) → Closed
```

- Cooldown: `CIRCUIT_BREAKER_COOLDOWN_SECS` (default 30s)
- Exactly one probe allowed during half-open (prevents thundering herd)
- Entries older than 2x cooldown auto-removed every 120s
- Scoped per sandbox, not per endpoint

## Persistent Store

```rust
pub struct PersistentStore<V> {
    db: LocalDatabase,
    // File-based JSON at $BLUEPRINT_STATE_DIR/ (default: ./blueprint-state)
    // RwLock-protected for concurrent tokio task access
}

// Operations:
store.get(id) -> Option<V>
store.find(predicate) -> Vec<V>
store.values() -> Vec<V>
store.insert(id, value)
store.remove(id)
store.update(id, |v| { /* mutate */ })
```

Records encrypted at rest via ChaCha20-Poly1305 (key from `SESSION_AUTH_SECRET`).

## Metrics

Atomic counters for telemetry:

```rust
// Core
total_jobs, total_duration_ms, total_input_tokens, total_output_tokens
// Resources
active_sandboxes, peak_sandboxes, allocated_cpu_cores, allocated_memory_mb
// Lifecycle
reaped_idle, reaped_lifetime, garbage_collected, snapshot_count
```

Optional QoS integration: periodic snapshot + on-chain submission (gated by `qos` feature flag).

## BSM Contract Pattern

```solidity
contract MyBlueprint is BlueprintServiceManagerBase {
    // Mode flags
    bool public immutable instanceMode;
    bool public immutable teeRequired;

    // State
    mapping(address => uint32) public operatorCapacity;
    mapping(bytes32 => address) public sandboxOperator;

    // Pricing multipliers per job
    uint256 constant CREATE_MULTIPLIER = 50;
    uint256 constant DELETE_MULTIPLIER = 1;

    // Events
    event SandboxCreated(bytes32 indexed sandboxId, address indexed operator);
    event OperatorProvisioned(uint64 indexed serviceId, address indexed operator);
}
```

Deploy the same contract 3x for cloud/instance/TEE-instance modes with different constructor flags.

## main.rs Startup Sequence

```rust
#[tokio::main]
async fn main() -> Result<()> {
    // 1. Logging
    setup_tracing();

    // 2. Auth validation
    session_auth::validate_required_config()?;

    // 3. Optional QoS
    let qos = init_qos_if_enabled().await;

    // 4. Optional TEE backend
    let tee = backend_factory::backend_from_env().await?;

    // 5. Blueprint environment
    let env = BlueprintEnvironment::load()?;

    // 6. Tangle client
    let client = env.tangle_client().await?;

    // 7. BPM bridge
    let bpm = connect_bpm(&env).await?;

    // 8. Operator API (spawned)
    let router = operator_api_router();
    let listener = TcpListener::bind((bind_addr, api_port)).await?;
    tokio::spawn(axum::serve(listener, router).with_graceful_shutdown(shutdown.clone()));

    // 9. Reconciliation
    reconcile_on_startup(&store).await?;

    // 10. Background services (spawned)
    spawn_reaper(store.clone(), interval);
    spawn_gc(store.clone(), interval);
    spawn_session_gc(interval);

    // 11. BlueprintRunner
    BlueprintRunner::new(env)
        .router(router())
        .producer(TangleProducer::new(client.clone()))
        .consumer(TangleConsumer::new(client))
        .run()
        .await?;
}
```

## Configuration

| Variable | Default | Purpose |
|----------|---------|---------|
| `SIDECAR_IMAGE` | `ghcr.io/tangle-network/sidecar:latest` | Container image |
| `SIDECAR_PUBLIC_HOST` | `127.0.0.1` | Sidecar URL hostname |
| `SIDECAR_HTTP_PORT` | `8080` | Container internal port |
| `SIDECAR_PULL_IMAGE` | `true` | Pull image on first use |
| `SANDBOX_DEFAULT_IDLE_TIMEOUT` | `1800` (30m) | Default idle timeout |
| `SANDBOX_DEFAULT_MAX_LIFETIME` | `86400` (1d) | Default max lifetime |
| `SANDBOX_MAX_IDLE_TIMEOUT` | `7200` (2h) | Operator cap on idle |
| `SANDBOX_MAX_MAX_LIFETIME` | `172800` (2d) | Operator cap on lifetime |
| `SANDBOX_REAPER_INTERVAL` | `30` | Reaper tick (seconds) |
| `SANDBOX_GC_INTERVAL` | `3600` | GC tick (seconds) |
| `SANDBOX_GC_HOT_RETENTION` | `86400` | Hot → Warm (seconds) |
| `SANDBOX_GC_WARM_RETENTION` | `172800` | Warm → Cold (seconds) |
| `SANDBOX_GC_COLD_RETENTION` | `604800` | Cold → Gone (seconds) |
| `SANDBOX_SNAPSHOT_AUTO_COMMIT` | `true` | Docker commit on stop |
| `SANDBOX_SNAPSHOT_DESTINATION_PREFIX` | (none) | Operator S3 prefix |
| `SESSION_AUTH_SECRET` | (required) | 32-byte hex for PASETO + encryption |
| `OPERATOR_API_PORT` | `9090` | Operator API bind port |
| `TEE_BACKEND` | (none) | `phala`/`nitro`/`gcp`/`azure`/`direct` |
| `ALLOW_STANDALONE` | `false` | Dev-only: bypass BPM connection |
| `OPERATOR_MAX_CAPACITY` | (none) | Advertised operator capacity |
| `BLUEPRINT_STATE_DIR` | `./blueprint-state` | Persistent store directory |

## Design Invariants

1. **Sandbox identity is immutable** across lifecycle (same ID after secret injection/recreation).
2. **Token generation is server-side only** — never in on-chain calldata.
3. **Secrets go in Phase 2** (off-chain), never Phase 1 (on-chain).
4. **Owner field is immutable** — set at create, enforced at every auth check.
5. **Circuit breaker is sandbox-scoped**, not endpoint-scoped.
6. **Session scope isolation is strict** — token for sandbox A cannot access sandbox B.
7. **Runtime backend is persistent** — stored in `metadata_json.runtime_backend`, cannot change.
8. **Firecracker auth mode must be explicit** — `FIRECRACKER_SIDECAR_AUTH_DISABLED` must be set.
9. **User BYOS3 snapshots are never deleted** by operator GC.
10. **Reaper soft-stops before hard-deleting** — idle timeout stops, max lifetime deletes.

## Reference Implementations

| Blueprint | Location | Notes |
|-----------|----------|-------|
| ai-agent-sandbox-blueprint | `~/code/ai-agent-sandbox-blueprint/` | Production reference. 5 jobs, Docker/Firecracker/TEE. |
| ai-trading-blueprints | `~/code/ai-trading-blueprints/` | Specialized DeFi variant. 12 jobs, adds validator committee + protocol adapters. Shares sandbox-runtime. |
| openclaw-sandbox-blueprint | `~/code/openclaw-sandbox-blueprint/` | Embedded UI variant. Serves React app from operator binary via `include_dir!`. |
| microvm-blueprint | `~/code/microvm-blueprint/` | Minimal reference. 5 lifecycle jobs + Axum query service. No sidecar SDK. |

## Critical Files (ai-agent-sandbox-blueprint)

### Runtime (sandbox-runtime/)
- `src/runtime.rs` — container lifecycle, CreateSandboxParams, SandboxRecord
- `src/operator_api.rs` — Axum router, request ID, security headers, rate limiting
- `src/session_auth.rs` — EIP-191 + PASETO
- `src/scoped_session_auth.rs` — sandbox/instance scope enforcement
- `src/auth.rs` — sidecar bearer token validation
- `src/store.rs` — PersistentStore (JSON + RwLock)
- `src/reaper.rs` — idle/lifetime enforcement, tiered GC
- `src/circuit_breaker.rs` — three-state circuit breaker
- `src/metrics.rs` — atomic counters
- `src/provision_progress.rs` — multi-phase progress tracking
- `src/secret_provisioning.rs` — two-phase secret injection
- `src/contracts.rs` — SandboxProvider + RuntimeAdapter traits
- `src/http.rs` — sidecar HTTP client
- `src/tee/mod.rs` — TeeBackend trait
- `src/firecracker.rs` — host-agent integration
- `src/error.rs` — SandboxError enum

### Blueprint (ai-agent-sandbox-blueprint-lib/)
- `src/lib.rs` — Router, ABI types, job constants
- `src/jobs/sandbox.rs` — create/delete handlers

### Binary (ai-agent-sandbox-blueprint-bin/)
- `src/main.rs` — BlueprintRunner wiring, background services

### Contract
- `contracts/src/AgentSandboxBlueprint.sol` — BSM with mode flags
