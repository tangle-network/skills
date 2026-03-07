# Tangle Blueprint Production Patterns

Reference document covering the practical infrastructure patterns required to take a Tangle blueprint from basic SDK integration to production readiness. All patterns are drawn from the `ai-agent-sandbox-blueprint` codebase and the `ai-trading-blueprints` codebase, both of which are shipping production systems.

**Target audience:** A developer who has built a basic blueprint (job handlers, `BlueprintRunner`) and needs to make it production-ready.

**Source codebases:**
- `ai-agent-sandbox-blueprint/` -- Production sandbox blueprint (3 variants: sandbox, instance, TEE instance)
- `ai-trading-blueprints/` -- Trading blueprint (reuses sandbox-runtime)
- `blueprint/crates/blueprint-manager/` -- BPM bridge (upstream SDK)

---

## Table of Contents

1. [Operator API Pattern](#1-operator-api-pattern)
2. [BPM (Blueprint Manager) Bridge](#2-bpm-blueprint-manager-bridge)
3. [Session Auth (EIP-191 + PASETO)](#3-session-auth-eip-191--paseto)
4. [Two-Phase Secret Provisioning](#4-two-phase-secret-provisioning)
5. [Circuit Breaker](#5-circuit-breaker)
6. [Reaper / GC Lifecycle](#6-reaper--gc-lifecycle)
7. [State Management](#7-state-management)
8. [Shared Runtime Crate Pattern](#8-shared-runtime-crate-pattern)
9. [Auto-Provisioning from BSM](#9-auto-provisioning-from-bsm)
10. [Direct Lifecycle Reporting](#10-direct-lifecycle-reporting)
11. [Security Hardening](#11-security-hardening)
12. [Billing / Escrow Watchdog](#12-billing--escrow-watchdog)
13. [TEE Backends](#13-tee-backends)
14. [Configuration Patterns](#14-configuration-patterns)
15. [Testing at Scale](#15-testing-at-scale)

---

## 1. Operator API Pattern

**What it is:** An Axum HTTP server that runs alongside the on-chain job handler loop, providing real-time read access and operations that do not belong on-chain.

**Why it exists:** On-chain transactions are slow (block time), expensive (gas), and public. Many operations -- listing sandboxes, streaming terminal output, injecting secrets -- need to happen off-chain via a fast, private HTTP API. The on-chain jobs handle state-mutating operations that require verifiability (create, delete, workflow create/trigger/cancel), while the HTTP API handles everything else.

**Priority:** Must have for production.

### On-chain vs HTTP split

| On-chain (job handlers)                | HTTP (operator API)                            |
| -------------------------------------- | ---------------------------------------------- |
| `SANDBOX_CREATE` (job 0)               | `GET /api/sandboxes` -- list owned sandboxes   |
| `SANDBOX_DELETE` (job 1)               | `POST /api/sandboxes/{id}/secrets` -- inject   |
| `WORKFLOW_CREATE` (job 2)              | `POST /api/sandboxes/{id}/exec` -- run command |
| `WORKFLOW_TRIGGER` (job 3)             | `GET /health`, `GET /readyz`, `GET /metrics`   |
| `WORKFLOW_CANCEL` (job 4)              | `POST /api/auth/challenge` -- session auth     |
| `reportProvisioned` (lifecycle)        | SSE streams for live terminal/chat             |
| `reportDeprovisioned` (lifecycle)      | Port proxy for user-exposed container ports    |

### Router structure

The router is organized into rate-limit tiers, each wrapped in its own middleware layer:

```rust
// Source: sandbox-runtime/src/operator_api.rs

pub fn operator_api_router_with_tee(
    tee: Option<Arc<dyn TeeBackend>>,
) -> Router {
    let cors = build_cors_layer();

    // Read endpoints: 120 req/min per IP
    let read_routes = Router::new()
        .route("/api/sandboxes", get(list_sandboxes))
        .route("/api/sandboxes/{sandbox_id}/ports", get(sandbox_ports_handler))
        // ... live session listing, streaming endpoints ...
        .layer(middleware::from_fn(rate_limit::read_rate_limit));

    // Write endpoints: 30 req/min per IP
    let write_routes = Router::new()
        .route("/api/sandboxes/{sandbox_id}/secrets",
            post(inject_secrets).delete(wipe_secrets))
        // ... exec, prompt, task, stop, resume, snapshot, SSH ...
        .layer(middleware::from_fn(rate_limit::write_rate_limit));

    // Auth endpoints: 10 req/min per IP (strictest)
    let auth_routes = Router::new()
        .route("/api/auth/challenge", post(create_challenge))
        .route("/api/auth/session",
            post(create_session).delete(revoke_session))
        .layer(middleware::from_fn(rate_limit::auth_rate_limit));

    // Health/metrics: rate-limited but unauthenticated
    let infra_routes = Router::new()
        .route("/health", get(health))
        .route("/readyz", get(readyz))
        .route("/metrics", get(prometheus_metrics))
        .layer(middleware::from_fn(rate_limit::read_rate_limit));

    Router::new()
        .merge(infra_routes)
        .merge(read_routes)
        .merge(write_routes)
        .merge(auth_routes)
        .layer(DefaultBodyLimit::max(1024 * 1024))  // 1 MB
        .layer(middleware::from_fn(security_headers_middleware))
        .layer(middleware::from_fn(http_metrics_middleware))
        .layer(tower_http::trace::TraceLayer::new_for_http())
        .layer(tower::limit::ConcurrencyLimitLayer::new(64))
        .layer(tower_http::timeout::TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(120),
        ))
        .layer(cors)
        .layer(middleware::from_fn(request_id_middleware))
}
```

### Middleware stack (outermost to innermost)

1. **Request ID** -- Assigns `x-request-id` to every request; propagated to sidecar calls via task-local for end-to-end tracing.
2. **CORS** -- Configurable allowed origins.
3. **Timeout** -- 120s hard cap, returns 408.
4. **Concurrency limit** -- 64 concurrent requests max.
5. **Trace** -- `tower_http::trace` for structured logging.
6. **HTTP metrics** -- Per-endpoint latency histograms, error counts.
7. **Security headers** -- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cache-Control: no-store`, `Strict-Transport-Security`.
8. **Rate limit** -- Per-tier (read/write/auth) applied at the route group level.

### Authentication on endpoints

All data-returning endpoints use the `SessionAuth` extractor, which validates the `Authorization: Bearer <token>` header. Infra endpoints (`/health`, `/readyz`, `/metrics`) are unauthenticated.

```rust
async fn list_sandboxes(SessionAuth(address): SessionAuth) -> impl IntoResponse {
    // `address` is the authenticated wallet address
    // Filter sandboxes to only show those owned by this address
}
```

**Source files:**
- `/home/drew/code/ai-agent-sandbox-blueprint/sandbox-runtime/src/operator_api.rs`

---

## 2. BPM (Blueprint Manager) Bridge

**What it is:** The protocol by which a blueprint binary connects to the Blueprint Manager (BPM) process that spawned it. The BPM acts as a reverse proxy, routing external traffic to the blueprint's operator API.

**Why it exists:** In production, blueprints run behind the BPM. The BPM handles TLS termination, port management, and service discovery. Blueprints need to register their HTTP endpoints with the BPM so external users can reach them.

**Priority:** Must have for production deployment.

### Startup sequence

The binary wiring in `main.rs` follows this exact order:

```rust
// Source: ai-agent-sandbox-blueprint-bin/src/main.rs

// 1. Load environment and connect to Tangle
let env = BlueprintEnvironment::load()?;

// 2. Connect to BPM bridge (or go standalone in dev mode)
let allow_standalone = std::env::var("ALLOW_STANDALONE")
    .map(|v| v.eq_ignore_ascii_case("true") || v == "1")
    .unwrap_or(false);

let bridge = match env.bridge().await {
    Ok(b) => match b.ping().await {
        Ok(()) => Some(b),
        Err(e) if allow_standalone => { warn!("..."); None }
        Err(e) => return Err(/* hard error */),
    },
    Err(e) if allow_standalone => { warn!("..."); None }
    Err(e) => return Err(/* hard error */),
};

// 3. Allocate port from BPM (or use preferred port in standalone)
let preferred_port: u16 = std::env::var("OPERATOR_API_PORT")
    .ok().and_then(|v| v.parse().ok())
    .unwrap_or(9090);

let (api_port, bind_addr) = if let Some(ref b) = bridge {
    let port = b.request_port(Some(preferred_port)).await?;
    (port, [127, 0, 0, 1u8])  // Bind localhost only behind proxy
} else {
    (preferred_port, [0, 0, 0, 0u8])  // Bind all interfaces in dev
};

// 4. Register with BPM proxy BEFORE starting API server
if let Some(ref b) = bridge {
    b.register_blueprint_service_proxy(
        service_id,
        Some(&format!("svc{service_id}")),  // API key prefix
        &format!("http://127.0.0.1:{api_port}"),
        &[],   // owners managed by BPM
        None,   // TLS terminated by BPM
    ).await?;
}

// 5. NOW start the API server
let listener = tokio::net::TcpListener::bind((bind_addr, api_port)).await?;
tokio::spawn(axum::serve(listener, router.into_make_service_with_connect_info::<SocketAddr>())
    .with_graceful_shutdown(/* ... */));
```

### Key invariants

- **Register before serve:** The BPM proxy must know about the service before the HTTP server starts accepting connections. This eliminates the race window where the server is live but unregistered.
- **Bind localhost behind BPM:** When running behind the proxy, bind `127.0.0.1` so only the BPM can reach the API. In standalone dev mode, bind `0.0.0.0`.
- **Unregister on shutdown:** After the API server is fully stopped, unregister from the BPM proxy:

```rust
.with_shutdown_handler(async move {
    // Stop API server first
    drop(api_shutdown_tx);
    tokio::time::timeout(Duration::from_secs(10), api_handle).await;

    // Then unregister from proxy
    if let Some(b) = shutdown_bridge {
        b.unregister_blueprint_service_proxy(service_id).await;
    }
})
```

### Environment variables

| Variable | Purpose | Default |
| --- | --- | --- |
| `BRIDGE_SOCKET_PATH` | Injected by BPM; path to Unix domain socket | (set by BPM) |
| `ALLOW_STANDALONE` | Allow running without BPM (dev only) | `false` |
| `OPERATOR_API_PORT` | Preferred port for operator API | `9090` |

**Source files:**
- `/home/drew/code/ai-agent-sandbox-blueprint/ai-agent-sandbox-blueprint-bin/src/main.rs`

---

## 3. Session Auth (EIP-191 + PASETO)

**What it is:** A challenge-response authentication flow that proves wallet ownership and issues encrypted session tokens. Users sign a challenge with their Ethereum wallet (EIP-191 `personal_sign`), and the operator issues a PASETO v4.local token.

**Why it exists:** The operator API needs to know which wallet address is making requests, so it can enforce ownership (you can only manage sandboxes you created). Traditional API keys would require a registration step. EIP-191 leverages the wallet the user already has from their on-chain interactions.

**Priority:** Must have for production.

### Authentication flow

```
Client                              Operator API
  |                                      |
  |  POST /api/auth/challenge            |
  |------------------------------------->|
  |  { nonce, message, expires_at }      |
  |<-------------------------------------|
  |                                      |
  |  [User signs `message` with wallet]  |
  |                                      |
  |  POST /api/auth/session              |
  |  { nonce, signature }                |
  |------------------------------------->|
  |  { token, address, expires_at }      |
  |<-------------------------------------|
  |                                      |
  |  GET /api/sandboxes                  |
  |  Authorization: Bearer <token>       |
  |------------------------------------->|
```

### Challenge generation

```rust
// Source: sandbox-runtime/src/session_auth.rs

const CHALLENGE_TTL_SECS: u64 = 300;    // 5 minutes
const MAX_CHALLENGES: usize = 10_000;   // Memory exhaustion prevention

pub fn create_challenge() -> Result<Challenge> {
    let mut nonce_bytes = [0u8; 32];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = hex::encode(nonce_bytes);

    let message = format!(
        "Sign this message to authenticate with Tangle Sandbox.\n\nNonce: {nonce}\nExpires: {}",
        now + CHALLENGE_TTL_SECS,
    );

    // Capacity check prevents memory exhaustion from unauthenticated requests
    let mut map = CHALLENGES.lock().unwrap_or_else(|e| e.into_inner());
    if map.len() >= MAX_CHALLENGES {
        return Err(SandboxError::Unavailable("Challenge capacity exceeded"));
    }
    map.insert(nonce, challenge.clone());
    Ok(challenge)
}
```

### EIP-191 signature verification

The operator recovers the signer's address from the signature without needing any pre-registered keys:

```rust
pub fn verify_eip191_signature(message: &str, signature_hex: &str) -> Result<String> {
    // Split signature into r+s (64 bytes) and v (1 byte)
    // EIP-191 prefix: "\x19Ethereum Signed Message:\n{len}{message}"
    // Keccak-256 hash, then recover public key from signature
    // Derive address from public key (last 20 bytes of keccak256(pubkey))
}
```

### PASETO token issuance

Tokens are encrypted with a symmetric key derived from `SESSION_AUTH_SECRET` via HKDF-SHA256:

```rust
const SESSION_TTL_SECS: u64 = 3600;  // 1 hour
const MAX_SESSIONS: usize = 50_000;

static SYMMETRIC_KEY: Lazy<SymmetricKey<V4>> = Lazy::new(|| {
    match std::env::var("SESSION_AUTH_SECRET") {
        Ok(secret) => derive_symmetric_key(secret.as_bytes()),
        Err(_) => {
            // WARNING: Random key means sessions break on restart
            tracing::error!("SESSION_AUTH_SECRET not set");
            random_key()
        }
    }
});
```

HKDF key derivation uses domain-specific salt and info parameters to ensure the PASETO key is independent from other uses of the same secret:

```rust
const HKDF_SALT: &[u8] = b"tangle-sandbox-blueprint-paseto-v4";
const HKDF_INFO: &[u8] = b"session-auth-symmetric-key-v1";
```

### SessionAuth extractor

Reusable across any blueprint's operator API:

```rust
pub struct SessionAuth(pub String);

impl<S: Send + Sync> FromRequestParts<S> for SessionAuth {
    type Rejection = (StatusCode, String);

    async fn from_request_parts(parts: &mut Parts, _state: &S)
        -> Result<Self, Self::Rejection>
    {
        let auth_header = parts.headers.get("authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or((StatusCode::UNAUTHORIZED, "Missing Authorization header"))?;

        let token = extract_bearer_token(auth_header)
            .ok_or((StatusCode::UNAUTHORIZED, "Invalid format"))?;

        let claims = validate_session_token(token)
            .map_err(|e| (StatusCode::UNAUTHORIZED, e.to_string()))?;

        Ok(SessionAuth(claims.address))
    }
}
```

### Session lifecycle

- **GC task:** Runs every 5 minutes to purge expired challenges and sessions.
- **Revocation:** `DELETE /api/auth/session` removes the token from the in-memory store.
- **Validation:** First checks in-memory store (fast), then falls back to PASETO decryption (survives restart if `SESSION_AUTH_SECRET` is set).

**Source files:**
- `/home/drew/code/ai-agent-sandbox-blueprint/sandbox-runtime/src/session_auth.rs`

---

## 4. Two-Phase Secret Provisioning

**What it is:** A pattern where sandbox creation (phase 1) happens on-chain with base configuration only, and secret injection (phase 2) happens off-chain via a signed HTTP request.

**Why it exists:** On-chain transaction calldata is public. API keys, private keys, and other credentials must never appear in blockchain transactions. This pattern ensures secrets travel only over the authenticated HTTPS channel between the user and the operator.

**Priority:** Must have for production.

### Phase 1: On-chain creation

The `SANDBOX_CREATE` job handler receives a `CreateSandboxParams` struct. The `env_json` field contains only non-sensitive configuration. The sidecar container starts with this base environment.

### Phase 2: HTTP secret injection

After creation, the sandbox owner calls the operator API:

```
POST /api/sandboxes/{sandbox_id}/secrets
Authorization: Bearer <token>
Content-Type: application/json

{
  "API_KEY": "sk-live-...",
  "DATABASE_URL": "postgres://..."
}
```

The operator:
1. Validates ownership (caller must match sandbox owner)
2. Stores the secrets as `user_env_json` on the sandbox record
3. Recreates the sidecar container with merged environment (base + secrets)
4. The sandbox ID is preserved across recreation

```rust
// Source: sandbox-runtime/src/secret_provisioning.rs

pub async fn inject_secrets(
    sandbox_id: &str,
    secret_env: Map<String, Value>,
    tee: Option<&dyn TeeBackend>,
) -> Result<SandboxRecord> {
    let user_env_json = serde_json::to_string(&secret_env)?;
    // Recreates the container with merged base_env + user_env
    let new_record = recreate_sidecar_with_env(sandbox_id, &user_env_json, tee).await?;
    Ok(new_record)
}
```

### Wipe operation

Secrets can be removed, returning the sandbox to base-only environment:

```
DELETE /api/sandboxes/{sandbox_id}/secrets
Authorization: Bearer <token>
```

### TEE restriction

Secret re-injection via container recreation is not supported for TEE sandboxes because it would invalidate attestation, break sealed secrets, and orphan the on-chain deployment ID. TEE sandboxes use the sealed-secrets API instead (`POST /api/sandboxes/{id}/tee/sealed-secrets`).

### Environment merge semantics

```rust
// User values override base values when keys collide
pub fn merge_env_json(base: &str, user: &str) -> String {
    // Parse both as JSON objects
    // Merge user on top of base
    // Return serialized result
}
```

**Source files:**
- `/home/drew/code/ai-agent-sandbox-blueprint/sandbox-runtime/src/secret_provisioning.rs`
- `/home/drew/code/ai-agent-sandbox-blueprint/sandbox-runtime/src/runtime.rs` (merge_env_json, recreate_sidecar_with_env)

---

## 5. Circuit Breaker

**What it is:** A three-state (closed/open/half-open) per-resource health tracker that prevents cascading failures when sidecars become unhealthy.

**Why it exists:** Without a circuit breaker, a failing sidecar causes every request to block for the full timeout before returning an error. This wastes resources, degrades user experience, and can cause thundering herd on recovery. The circuit breaker fails fast and allows controlled recovery.

**Priority:** Must have for production.

### State machine

```
    Closed --------[failure]--------> Open
      ^                                |
      |                          [cooldown expires]
      |                                |
      |                                v
      +-------[probe success]------ Half-Open
                                       |
                               [probe failure]
                                       |
                                       v
                                     Open (reset cooldown)
```

### Implementation

```rust
// Source: sandbox-runtime/src/circuit_breaker.rs

const DEFAULT_COOLDOWN_SECS: u64 = 30;
const GC_INTERVAL_SECS: u64 = 120;

struct BreakerEntry {
    marked_at: Instant,
    probing: bool,  // True when half-open probe is in flight
}

static UNHEALTHY: Lazy<Mutex<HashMap<String, BreakerEntry>>> = ...;
```

### Usage pattern

Before every sidecar call:

```rust
// Check if sandbox is healthy
circuit_breaker::check_health(sandbox_id)?;

// Make the sidecar call
match sidecar_post_json(&url, "/terminals/commands", &token, payload).await {
    Ok(response) => {
        circuit_breaker::mark_healthy(sandbox_id);
        Ok(response)
    }
    Err(e) => {
        circuit_breaker::mark_unhealthy(sandbox_id);
        Err(e)
    }
}
```

### Thundering herd prevention

In the half-open state, exactly one probe request is allowed through. All other requests are rejected until the probe completes:

```rust
pub fn check_health(sandbox_id: &str) -> Result<()> {
    if let Some(entry) = map.get_mut(sandbox_id) {
        if elapsed < cooldown {
            return Err(/* Open state -- cooldown active */);
        }
        if entry.probing {
            return Err(/* Half-open -- probe already in flight */);
        }
        entry.probing = true;  // Allow this one probe
    }
    Ok(())
}
```

### Cleanup

Circuit breaker state is cleared when a sandbox is deleted or successfully resumed:

```rust
circuit_breaker::clear(sandbox_id);
```

Periodic GC removes entries older than 2x cooldown to prevent unbounded memory growth.

**Source files:**
- `/home/drew/code/ai-agent-sandbox-blueprint/sandbox-runtime/src/circuit_breaker.rs`

---

## 6. Reaper / GC Lifecycle

**What it is:** Two background tasks that manage sandbox lifecycle -- the reaper enforces idle timeout and max lifetime, while the GC progressively moves stopped sandboxes through storage tiers until deletion.

**Why it exists:** Without lifecycle management, sandboxes accumulate indefinitely, consuming Docker resources, disk space, and S3 storage. The tiered approach preserves recent state for quick resume while aggressively cleaning old state.

**Priority:** Must have for production.

### Reaper (sandbox-runtime/src/reaper.rs)

Runs every `SANDBOX_REAPER_INTERVAL` seconds (default: 30s). For each running sandbox:

1. **Max lifetime exceeded:** Delete immediately.
2. **Idle timeout exceeded:**
   - Upload S3 snapshot (if configured)
   - Stop the container
   - Docker commit to preserve filesystem (if `snapshot_auto_commit` is true)

```rust
// Soft stop: idle too long
if record.idle_timeout_seconds > 0 && activity + record.idle_timeout_seconds <= now {
    // Pre-stop: S3 snapshot while container is still running
    if let Some(ref dest) = snapshot_dest {
        upload_s3_snapshot(&record, dest).await;
    }
    stop_sidecar(&record).await;
    // Post-stop: docker commit
    if config.snapshot_auto_commit {
        commit_container(&record).await;
    }
}
```

### GC tiers

Runs every `SANDBOX_GC_INTERVAL` seconds (default: 3600s). Progressively moves stopped sandboxes through:

```
Hot (stopped container)  --[gc_hot_retention]--> Warm (committed image)
Warm (committed image)   --[gc_warm_retention]--> Cold (S3 snapshot only)
Cold (S3 snapshot)       --[gc_cold_retention]--> Gone (record removed)
```

Default retention periods:
- **Hot:** 86400s (24h) -- container still exists, can be resumed instantly
- **Warm:** 172800s (48h) -- Docker image exists, resume requires container re-creation
- **Cold:** 604800s (7d) -- only S3 snapshot, resume requires download and re-creation

User BYOS3 (Bring Your Own S3) snapshots are never deleted by GC.

### Startup reconciliation

On startup, `reconcile_on_startup()` syncs the persistent store with Docker reality:

- Container gone but record says Running? Mark as Stopped.
- Container running but record says Stopped? Mark as Running.
- Container gone with no snapshot? Remove orphan record.

### Panic recovery

Background tasks are spawned as child tasks so panics are caught by `JoinHandle` instead of killing the loop:

```rust
tokio::spawn(async move {
    loop {
        tokio::select! {
            _ = interval.tick() => {
                let h = tokio::spawn(reaper_tick());
                if let Err(e) = h.await {
                    error!("Reaper tick panicked: {e}");
                }
            }
            _ = shutdown_rx.changed() => break,
        }
    }
});
```

**Source files:**
- `/home/drew/code/ai-agent-sandbox-blueprint/sandbox-runtime/src/reaper.rs`
- `/home/drew/code/ai-agent-sandbox-blueprint/ai-agent-sandbox-blueprint-bin/src/main.rs` (spawn logic)

---

## 7. State Management

**What it is:** A `PersistentStore` backed by `LocalDatabase` (JSON file), protected by `RwLock` for concurrent access, with ChaCha20-Poly1305 AEAD encryption for sensitive fields at rest.

**Why it exists:** Blueprint operators need durable state that survives restarts (sandbox records, pending reports), but also needs to be safe under concurrent access from multiple tokio tasks (API handlers, reaper, GC) and encrypted to protect secrets on disk.

**Priority:** Must have for production.

### PersistentStore

```rust
// Source: sandbox-runtime/src/store.rs

pub struct PersistentStore<V> {
    db: RwLock<LocalDatabase<V>>,
}
```

Key operations: `get`, `insert`, `remove`, `update`, `values`, `find`, `replace`.

Read operations acquire a shared read lock; write operations acquire an exclusive write lock. This prevents concurrent read-modify-write races across tokio tasks.

### State directory

```rust
pub fn state_dir() -> PathBuf {
    let dir = std::env::var("BLUEPRINT_STATE_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("blueprint-state"));
    // Creates with 0o700 permissions (owner only)
}
```

**Limitation:** No OS-level file locking. Two operator processes sharing the same state directory can corrupt the JSON store. Each operator must use a unique state directory.

### Seal/Unseal (at-rest encryption)

Sensitive fields (`token`, `base_env_json`, `user_env_json`) are encrypted before persisting using ChaCha20-Poly1305 AEAD:

```rust
// Source: sandbox-runtime/src/runtime.rs

const ENC_PREFIX: &str = "enc:v1:";

static SEAL_KEY: Lazy<[u8; 32]> = Lazy::new(|| {
    match std::env::var("SESSION_AUTH_SECRET") {
        Ok(secret) => {
            // HKDF-SHA256 with distinct info param from PASETO key
            let hk = Hkdf::<Sha256>::new(Some(SECRETS_HKDF_SALT), secret.as_bytes());
            hk.expand(b"secrets-at-rest-encryption-v1", &mut key);
            key
        }
        Err(_) => random_ephemeral_key(),  // Sessions break on restart
    }
});

fn seal_field(plaintext: &str) -> Result<String> {
    // Returns "enc:v1:" + base64(nonce || ciphertext)
    let cipher = ChaCha20Poly1305::new((&*SEAL_KEY).into());
    let nonce = ChaCha20Poly1305::generate_nonce(&mut OsRng);
    let ciphertext = cipher.encrypt(&nonce, plaintext.as_bytes())?;
    Ok(format!("{ENC_PREFIX}{}", base64_encode(nonce || ciphertext)))
}

pub fn seal_record(record: &mut SandboxRecord) -> Result<()> {
    record.token = seal_field(&record.token)?;
    record.base_env_json = seal_field(&record.base_env_json)?;
    record.user_env_json = seal_field(&record.user_env_json)?;
    Ok(())
}
```

Properties:
- Each seal call uses a random nonce, so the same plaintext produces different ciphertext.
- Tampered ciphertext fails AEAD authentication (no silent corruption).
- Migration path: unencrypted values pass through `unseal_field` unchanged (with a warning), and are re-encrypted on next write.

**Source files:**
- `/home/drew/code/ai-agent-sandbox-blueprint/sandbox-runtime/src/store.rs`
- `/home/drew/code/ai-agent-sandbox-blueprint/sandbox-runtime/src/runtime.rs` (seal/unseal)

---

## 8. Shared Runtime Crate Pattern

**What it is:** The `sandbox-runtime` crate is a shared library used by all blueprint variants and even by separate blueprint repositories.

**Why it exists:** The sandbox, instance, and TEE instance blueprints all need the same operator API, session auth, circuit breaker, reaper, store, and metrics infrastructure. Extracting this into a shared crate eliminates duplication and ensures consistent behavior.

**Priority:** Must have when building multiple blueprint variants.

### Workspace structure (sandbox blueprint)

```
ai-agent-sandbox-blueprint/
  Cargo.toml                          # Workspace root
  sandbox-runtime/                    # Shared runtime crate
    src/
      operator_api.rs                 # HTTP API
      session_auth.rs                 # EIP-191 + PASETO
      circuit_breaker.rs              # Health tracking
      reaper.rs                       # Lifecycle management
      store.rs                        # Persistent store
      metrics.rs                      # On-chain + HTTP metrics
      rate_limit.rs                   # Rate limiting
      runtime.rs                      # Core sidecar management
      secret_provisioning.rs          # Two-phase secrets
      tee/                            # TEE backends
  ai-agent-sandbox-blueprint-lib/     # Fleet-mode job handlers
  ai-agent-sandbox-blueprint-bin/     # Fleet-mode binary
  ai-agent-instance-blueprint-lib/    # Instance-mode job handlers
  ai-agent-instance-blueprint-bin/    # Instance-mode binary
  ai-agent-tee-instance-blueprint-lib/
  ai-agent-tee-instance-blueprint-bin/
```

### Cross-repository sharing (trading blueprint)

The trading blueprint (separate repository) depends on `sandbox-runtime` via path dependency:

```toml
# ai-trading-blueprints/trading-blueprint-lib/Cargo.toml
sandbox-runtime = { path = "../../ai-agent-sandbox-blueprint/sandbox-runtime" }

# ai-trading-blueprints/trading-instance-blueprint-lib/Cargo.toml
sandbox-runtime = { path = "../../ai-agent-sandbox-blueprint/sandbox-runtime" }

# With TEE features enabled:
# ai-trading-blueprints/trading-tee-instance-blueprint-lib/Cargo.toml
sandbox-runtime = { path = "../../ai-agent-sandbox-blueprint/sandbox-runtime", features = ["tee-all"] }
```

### What to extract vs keep variant-specific

**Extract into sandbox-runtime:**
- Operator API router and middleware
- Session auth (EIP-191, PASETO, SessionAuth extractor)
- Circuit breaker, rate limiting
- PersistentStore, seal/unseal
- Reaper/GC lifecycle
- Metrics (on-chain + HTTP)
- TEE backend trait and implementations
- Sidecar creation/deletion/recreation

**Keep in variant-specific crates:**
- Job handler implementations (what happens when jobs are submitted)
- ABI types (sol! macro definitions for the variant's contract)
- Auto-provisioning logic (instance-specific)
- Billing/escrow watchdog (instance-specific)
- Lifecycle reporting (reportProvisioned/reportDeprovisioned)
- Binary wiring (which producers, consumers, features to enable)

**Source files:**
- `/home/drew/code/ai-agent-sandbox-blueprint/Cargo.toml` (workspace)
- `/home/drew/code/ai-trading-blueprints/Cargo.toml` (cross-repo consumer)

---

## 9. Auto-Provisioning from BSM

**What it is:** Instance blueprints read their sandbox configuration from the on-chain Blueprint Service Manager (BSM) at startup, provision the sandbox off-chain, and report back on-chain.

**Why it exists:** In instance mode, there is no `SANDBOX_CREATE` job. Instead, the service configuration is written to the BSM contract when the service is created. The operator reads this configuration and provisions the sandbox automatically.

**Priority:** Must have for instance blueprints.

### Flow

```
1. Binary starts
2. Check local state: already provisioned? -> reconcile with chain, done
3. Poll BSM: getServiceConfig(serviceId) until config available
4. Decode config as ProvisionRequest
5. Call provision_core() to create the sandbox
6. Store record via set_instance_sandbox()
7. Call reportProvisioned() on-chain via blueprint manager contract
8. If report fails: persist to retry queue for background retry
```

### Configuration

```rust
// Source: ai-agent-instance-blueprint-lib/src/auto_provision.rs

pub struct AutoProvisionConfig {
    pub bsm_address: Address,
    pub http_rpc_endpoint: String,
    pub service_id: u64,
    pub poll_interval_secs: u64,     // default: 5
    pub max_attempts: u32,           // default: 60
}

impl AutoProvisionConfig {
    pub fn from_env(service_id: u64) -> Option<Self> {
        let bsm_str = std::env::var("BSM_ADDRESS").ok()?;
        // ...
    }
}
```

### Reading on-chain config

```rust
sol! {
    #[sol(rpc)]
    interface IBsmRead {
        function getServiceConfig(uint64 serviceId) external view returns (bytes memory);
        function serviceOwner(uint64 serviceId) external view returns (address);
    }
}

async fn poll_service_config(config: &AutoProvisionConfig) -> Result<Option<Vec<u8>>, String> {
    let contract = IBsmRead::new(config.bsm_address, &provider);
    let result = contract.getServiceConfig(config.service_id).call().await?;
    if result.0.is_empty() { Ok(None) } else { Ok(Some(result.0.to_vec())) }
}
```

### Idempotent startup

If local state already exists, the auto-provisioner reconciles with the chain instead of re-provisioning:

```rust
if let Some(record) = get_instance_sandbox()? {
    // Already provisioned locally -- just ensure chain knows
    ensure_local_provision_reported(client, service_id, &record).await?;
    return Ok(());
}
```

**Source files:**
- `/home/drew/code/ai-agent-sandbox-blueprint/ai-agent-instance-blueprint-lib/src/auto_provision.rs`
- `/home/drew/code/ai-agent-sandbox-blueprint/ai-agent-instance-blueprint-lib/src/lib.rs` (ABI types)

---

## 10. Direct Lifecycle Reporting

**What it is:** Instance blueprints report their provisioned/deprovisioned status directly to the on-chain blueprint manager contract, with a persistent retry queue for resilience.

**Why it exists:** In instance mode, there is no on-chain job to return results through. The operator must proactively inform the chain that provisioning succeeded (so the service appears as active) or that deprovisioning occurred (so the service can be cleaned up).

**Priority:** Must have for instance blueprints.

### ABI

```rust
// Source: ai-agent-instance-blueprint-lib/src/reporting.rs

sol! {
    #[sol(rpc)]
    interface IInstanceLifecycleReporter {
        function reportProvisioned(
            uint64 serviceId,
            string sandboxId,
            string sidecarUrl,
            uint32 sshPort,
            string teeAttestationJson
        ) external;

        function reportDeprovisioned(uint64 serviceId) external;
    }
}
```

### Persistent retry queue

If `reportProvisioned` fails (e.g., RPC outage, gas issues), the payload is persisted:

```rust
pub fn mark_pending_provision_report(
    service_id: u64, output: &ProvisionOutput, err: &str
) -> Result<(), String> {
    let pending = PendingProvisionReport::from_output(service_id, output, err.to_string());
    pending_reports()?.insert(pending_key(service_id), pending)
}
```

A background worker retries pending reports every `PENDING_REPORT_RETRY_SECS` (default: 20s):

```rust
pub fn spawn_pending_provision_report_worker(
    client: TangleClient,
    service_id: u64,
    mut shutdown_rx: watch::Receiver<()>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(interval_secs));
        loop {
            tokio::select! {
                _ = interval.tick() => {
                    retry_pending_provision_report_once(&client, service_id).await;
                }
                _ = shutdown_rx.changed() => break,
            }
        }
    })
}
```

### Idempotent reconciliation

Before retrying, the worker checks if the operator is already provisioned on-chain:

```rust
pub async fn retry_pending_provision_report_once(
    client: &TangleClient, service_id: u64
) -> Result<bool, String> {
    if is_local_operator_provisioned(client, service_id).await? {
        clear_pending_provision_report(service_id)?;
        return Ok(true);  // Already reported
    }
    // ... retry report_local_provision ...
}
```

**Source files:**
- `/home/drew/code/ai-agent-sandbox-blueprint/ai-agent-instance-blueprint-lib/src/reporting.rs`

---

## 11. Security Hardening

**Priority:** Must have for production.

### SSRF prevention

Snapshot destination URLs are validated against SSRF risks:

```rust
// Source: sandbox-runtime/src/util.rs

// Rejects:
// - Non-HTTPS/S3 schemes (file://, ftp://, gopher://)
// - Private/loopback IPs (10.x, 172.16-31.x, 192.168.x, 127.x)
// - IPv4-mapped IPv6 (::ffff:10.0.0.1)
// - Cloud metadata (169.254.x.x)
// - Link-local addresses
```

Port proxying to user containers is safe by construction because the target URL is always `127.0.0.1:<docker_mapped_port>`:

```rust
// operator_api.rs -- port proxy is mapped to a random localhost port by Docker,
// so SSRF to external hosts is impossible by construction.
```

### Security headers

Applied to every response via middleware:

```rust
headers.insert("x-content-type-options", "nosniff");
headers.insert("x-frame-options", "DENY");
headers.insert("cache-control", "no-store");
headers.insert("strict-transport-security", "max-age=63072000; includeSubDomains");
```

### Rate limiting

Three tiers of sliding-window rate limiting per client IP:

| Tier | Limit | Endpoints |
| --- | --- | --- |
| Read | 120 req/min | GET endpoints |
| Write | 30 req/min | POST/DELETE endpoints |
| Auth | 10 req/min | Challenge/session endpoints |

XFF header is only trusted when the connection comes from a loopback or private IP (i.e., through BPM proxy). Direct connections from public IPs use the socket address, preventing XFF spoofing:

```rust
fn extract_client_ip(req: &Request) -> Option<IpAddr> {
    match connect_ip {
        Some(ip) if is_trusted_proxy(ip) => {
            // Trust XFF from loopback/private
            req.headers().get("x-forwarded-for")...
        }
        Some(ip) => Some(ip),  // Direct connection, ignore XFF
        None => req.headers().get("x-forwarded-for")...  // Fallback
    }
}
```

### Request body limit

1 MB maximum request body to prevent DoS:

```rust
.layer(DefaultBodyLimit::max(1024 * 1024))
```

### Concurrency limit

64 concurrent requests maximum:

```rust
.layer(tower::limit::ConcurrencyLimitLayer::new(64))
```

### Background task panic recovery

All background tasks (reaper, GC, session GC, QoS metrics) spawn each tick as a child task so panics are isolated:

```rust
let h = tokio::spawn(reaper_tick());
if let Err(e) = h.await {
    error!("Reaper tick panicked: {e}");
    // Loop continues -- next tick will run normally
}
```

### State directory permissions

Created with `0o700` (owner read/write/execute only) on Unix:

```rust
std::fs::set_permissions(&dir, Permissions::from_mode(0o700));
```

### Capacity limits on in-memory stores

Prevent memory exhaustion from unauthenticated requests:

- Challenges: max 10,000 pending
- Sessions: max 50,000 active
- Rate limit buckets: GC every 5 minutes

**Source files:**
- `/home/drew/code/ai-agent-sandbox-blueprint/sandbox-runtime/src/util.rs` (SSRF)
- `/home/drew/code/ai-agent-sandbox-blueprint/sandbox-runtime/src/operator_api.rs` (headers, body limit)
- `/home/drew/code/ai-agent-sandbox-blueprint/sandbox-runtime/src/rate_limit.rs`
- `/home/drew/code/ai-agent-sandbox-blueprint/sandbox-runtime/src/session_auth.rs` (capacity limits)

---

## 12. Billing / Escrow Watchdog

**What it is:** A background task that monitors the on-chain escrow balance for a service and auto-deprovisions the sandbox when the balance is exhausted.

**Why it exists:** Service operators need to be compensated. When a user's escrow runs out, the operator should stop providing resources. The watchdog automates this, preventing resource theft.

**Priority:** Nice to have (gated behind `billing` feature flag).

### How it works

```rust
// Source: ai-agent-instance-blueprint-lib/src/billing.rs

sol! {
    interface ITangleRead {
        function getServiceEscrow(uint64 serviceId) external view returns (ServiceEscrow memory);
        function getBlueprintConfig(uint64 blueprintId) external view returns (BlueprintConfig memory);
    }
}
```

On each tick (default: every 300s):
1. Call `getServiceEscrow(serviceId)` to get current balance
2. Call `getBlueprintConfig(blueprintId)` to get subscription rate
3. If `balance < subscriptionRate`, increment consecutive failure counter
4. If failures exceed `max_consecutive_failures` (default: 3), trigger deprovision with grace period
5. Write `billing_status.json` for external observability

### Configuration

```rust
pub struct EscrowWatchdogConfig {
    pub tangle_contract: Address,
    pub http_rpc_endpoint: String,
    pub service_id: u64,
    pub blueprint_id: u64,
    pub check_interval_secs: u64,          // default: 300
    pub max_consecutive_failures: u32,      // default: 3
    pub low_balance_multiplier: u32,        // default: 3 (warn when < 3x rate)
    pub deprovision_grace_period_secs: u64, // default: 30
}
```

Loaded from environment: `TANGLE_CONTRACT_ADDRESS`, `ESCROW_CHECK_INTERVAL_SECS`, `ESCROW_MAX_CONSECUTIVE_FAILURES`, etc.

**Source files:**
- `/home/drew/code/ai-agent-sandbox-blueprint/ai-agent-instance-blueprint-lib/src/billing.rs`

---

## 13. TEE Backends

**What it is:** A pluggable backend system for deploying sandboxes inside Trusted Execution Environments.

**Why it exists:** Different cloud providers and TEE technologies (Intel TDX, AWS Nitro, AMD SEV-SNP) have completely different APIs and deployment models. The `TeeBackend` trait abstracts these differences.

**Priority:** Nice to have (needed only for TEE deployments).

### Supported backends

```rust
// Source: sandbox-runtime/src/tee/mod.rs

pub enum TeeType {
    None,   // Standard Docker
    Tdx,    // Intel TDX (Phala dstack, GCP C3, Azure DCesv5)
    Nitro,  // AWS Nitro Enclaves
    Sev,    // AMD SEV-SNP (Azure DCasv5, GCP N2D)
}
```

Backend implementations are feature-gated:

```rust
#[cfg(feature = "tee-phala")]   pub mod phala;
#[cfg(feature = "tee-direct")]  pub mod direct;
#[cfg(feature = "tee-aws-nitro")] pub mod aws_nitro;
#[cfg(feature = "tee-gcp")]     pub mod gcp;
#[cfg(feature = "tee-azure")]   pub mod azure;
```

### TeeBackend trait

Each backend implements deploy, stop, resume, delete, and attestation operations. The `TeeDeployParams` struct is constructed from `CreateSandboxParams`:

```rust
pub struct TeeDeployParams {
    pub sandbox_id: String,
    pub image: String,
    pub env_vars: Vec<(String, String)>,
    pub cpu_cores: u64,
    pub memory_mb: u64,
    pub disk_gb: u64,
    pub http_port: u16,
    pub ssh_port: Option<u16>,
    pub sidecar_token: String,
    pub extra_ports: Vec<u16>,
}
```

### Initialization

The TEE backend is initialized from the `TEE_BACKEND` environment variable at startup:

```rust
let tee_backend = if std::env::var("TEE_BACKEND").is_ok() {
    let backend = backend_factory::backend_from_env()?;
    Some(backend)
} else {
    None
};
```

### Sealed secrets

TEE sandboxes have their own sealed-secrets API (`/api/sandboxes/{id}/tee/sealed-secrets`) because the standard secret injection (which recreates the container) would invalidate attestation.

**Source files:**
- `/home/drew/code/ai-agent-sandbox-blueprint/sandbox-runtime/src/tee/mod.rs`
- `/home/drew/code/ai-agent-sandbox-blueprint/sandbox-runtime/src/tee/backend_factory.rs`
- `/home/drew/code/ai-agent-sandbox-blueprint/sandbox-runtime/src/tee/sealed_secrets.rs`
- `/home/drew/code/ai-agent-sandbox-blueprint/sandbox-runtime/src/tee/sealed_secrets_api.rs`

---

## 14. Configuration Patterns

**Priority:** Must have for production.

### Environment variables

The primary configuration mechanism. `SidecarRuntimeConfig::load()` reads all settings from env vars with sensible defaults:

| Variable | Default | Purpose |
| --- | --- | --- |
| `SIDECAR_IMAGE` | `tangle-sidecar:latest` | Default sidecar Docker image |
| `SIDECAR_PUBLIC_HOST` | `127.0.0.1` | Host for sidecar URLs |
| `SIDECAR_HTTP_PORT` | `8080` | Default container port |
| `SESSION_AUTH_SECRET` | (random) | **Required in production** -- PASETO + seal key |
| `BLUEPRINT_STATE_DIR` | `./blueprint-state` | Persistent state directory |
| `SANDBOX_DEFAULT_IDLE_TIMEOUT` | `1800` (30m) | Default idle timeout |
| `SANDBOX_DEFAULT_MAX_LIFETIME` | `86400` (24h) | Default max lifetime |
| `SANDBOX_MAX_COUNT` | `100` | Maximum concurrent sandboxes |
| `SANDBOX_REAPER_INTERVAL` | `30` | Reaper tick interval (seconds) |
| `SANDBOX_GC_INTERVAL` | `3600` | GC tick interval (seconds) |
| `SANDBOX_GC_HOT_RETENTION` | `86400` | Hot tier retention (seconds) |
| `SANDBOX_GC_WARM_RETENTION` | `172800` | Warm tier retention (seconds) |
| `SANDBOX_GC_COLD_RETENTION` | `604800` | Cold tier retention (seconds) |
| `CIRCUIT_BREAKER_COOLDOWN_SECS` | `30` | Circuit breaker cooldown |
| `ALLOW_STANDALONE` | `false` | Allow running without BPM |
| `OPERATOR_API_PORT` | `9090` | Preferred API port |
| `TEE_BACKEND` | (unset) | TEE backend type |

### operator.toml

Configuration for the pricing engine gRPC sidecar:

```toml
# Source: config/operator.toml

database_path = "data/pricing-engine"
keystore_path = "data/keystore"

rpc_bind_address = "0.0.0.0"
rpc_port = 50051

rest_enabled = true
rest_port = 9944

quote_validity_duration_secs = 300
pow_difficulty = 20

default_pricing_config = "config/default_pricing.toml"
job_pricing_config = "config/job_pricing.toml"
```

### job_pricing.toml

Per-job pricing configuration. Different blueprint modes (sandbox, instance, tee_instance) can have different pricing:

```toml
# Source: config/job_pricing.toml

[sandbox.jobs.0]
name = "SANDBOX_CREATE"
mode = "dynamic"
multiplier = 50
base_price = "50000000000000000"

[sandbox.jobs.0.dynamic]
cpu_rate_per_core = "5000000000000000"
mem_rate_per_gb   = "3000000000000000"
disk_rate_per_gb  = "1000000000000000"

[sandbox.jobs.1]
name = "SANDBOX_DELETE"
mode = "flat"
price = "1000000000000000"
```

Instance and TEE instance modes only price workflow jobs (2-4), since lifecycle is operator-reported.

### Startup validation

Critical configuration is validated at startup with panics (intentional -- unrecoverable misconfigurations):

```rust
assert!(!image.trim().is_empty(), "SIDECAR_IMAGE must not be empty");
assert!(container_port > 0, "SIDECAR_HTTP_PORT must be > 0");
```

`SESSION_AUTH_SECRET` is validated separately with a soft error in test mode:

```rust
if let Err(msg) = session_auth::validate_required_config() {
    if is_test_mode {
        warn!("Config validation (test mode): {msg}");
    } else {
        return Err(msg);
    }
}
```

**Source files:**
- `/home/drew/code/ai-agent-sandbox-blueprint/sandbox-runtime/src/runtime.rs` (SidecarRuntimeConfig)
- `/home/drew/code/ai-agent-sandbox-blueprint/config/operator.toml`
- `/home/drew/code/ai-agent-sandbox-blueprint/config/job_pricing.toml`

---

## 15. Testing at Scale

**Priority:** Must have for production.

### Unit tests

Every module has extensive unit tests. Run with:

```bash
cargo test -p sandbox-runtime
```

Key test patterns:
- **Circuit breaker:** Unique sandbox IDs per test to avoid cross-test interference from the shared static map.
- **Session auth:** Capacity-test mutex (`CAPACITY_LOCK`) prevents races between capacity-exhaustion tests and normal tests.
- **Seal/unseal:** Roundtrip tests, corruption detection, tamper detection, migration passthrough.

### Integration tests with real sidecars

Tests that spin up actual Docker sidecar containers:

```bash
# Real sidecar integration tests (sandbox)
REAL_SIDECAR=1 cargo test -p ai-agent-sandbox-blueprint-lib --test real_sidecar -- --test-threads=1

# Real sidecar integration tests (instance)
REAL_SIDECAR=1 cargo test -p ai-agent-instance-blueprint-lib --test real_sidecar -- --test-threads=1

# Operator API E2E with real sidecar
SIDECAR_E2E=1 cargo test -p ai-agent-sandbox-blueprint-lib --test e2e_operator_api -- --test-threads=1
```

Note: `--test-threads=1` is required because tests share Docker resources and port ranges.

### Shell E2E scripts

Full end-to-end testing against a running local stack:

```bash
# Start local stack (Anvil + operator + Docker)
SKIP_BUILD=1 ./scripts/deploy-local.sh

# Run E2E tests
./scripts/test-e2e.sh
```

The E2E script exercises:
- On-chain state verification
- Operator API health/readyz
- Session auth flow (challenge, signature, token)
- Sandbox lifecycle (create via job, list, exec, stop, resume, delete)
- Instance lifecycle
- Error cases (unauthorized, not found, duplicate)
- SSRF prevention (snapshot destination validation)

### Regression gate

Before merging any change:

```bash
cargo test -p sandbox-runtime
cargo clippy -p sandbox-runtime --all-targets --all-features -- -D warnings
pnpm --dir ui test
pnpm --dir ui typecheck
REAL_SIDECAR=1 cargo test -p ai-agent-sandbox-blueprint-lib --test real_sidecar -- --test-threads=1
REAL_SIDECAR=1 cargo test -p ai-agent-instance-blueprint-lib --test real_sidecar -- --test-threads=1
SIDECAR_E2E=1 cargo test -p ai-agent-sandbox-blueprint-lib --test e2e_operator_api -- --test-threads=1
```

### Operator API unit tests

The operator API has unit tests using Axum's test utilities with mock sidecars:

```rust
// Source: sandbox-runtime/src/operator_api.rs (tests module)

fn app() -> Router { operator_api_router() }

fn test_auth_header() -> String {
    let token = session_auth::create_test_token("0x1234...");
    format!("Bearer {token}")
}

// Mock sidecar for testing exec/prompt/task handlers
async fn mock_sidecar_exec(State(state): State<MockSidecarState>, Json(payload): Json<Value>)
    -> Json<Value> { /* ... */ }
```

### Trading blueprint tests

```bash
# Full E2E suite
SIDECAR_E2E=1 cargo test -p trading-blueprint-lib --test tangle_e2e_full -- --nocapture

# Binary process E2E
SIDECAR_E2E=1 cargo test -p trading-blueprint-lib --test tangle_binary_e2e -- --nocapture

# Operator API tests (no infra needed)
cargo test -p trading-blueprint-bin -- operator_api
```

**Source files:**
- `/home/drew/code/ai-agent-sandbox-blueprint/scripts/test-e2e.sh`
- `/home/drew/code/ai-agent-sandbox-blueprint/CLAUDE.md` (regression gate)
- `/home/drew/code/ai-trading-blueprints/CLAUDE.md` (trading test commands)

---

## 16. QoS / Heartbeat Service

Blueprints can report heartbeats and on-chain metrics to prove liveness and track operational health. This is feature-gated behind `qos` in `Cargo.toml`.

**Priority:** Nice to have for MVP, required for production services with SLAs.

### Feature flag

```toml
[features]
qos = ["dep:blueprint-qos"]
```

### Wiring in main.rs

```rust
#[cfg(feature = "qos")]
use blueprint_qos::QoSServiceBuilder;
#[cfg(feature = "qos")]
use blueprint_qos::heartbeat::{HeartbeatConfig, HeartbeatConsumer};
#[cfg(feature = "qos")]
use blueprint_qos::metrics::MetricsConfig;
```

Enabled by `QOS_ENABLED=true` env var. Builder pattern:

```rust
let qos_service = QoSServiceBuilder::new()
    .with_metrics_config(MetricsConfig::default())
    .with_dry_run(dry_run)  // QOS_DRY_RUN env, default true
    .with_heartbeat_config(hb_config)
    .with_heartbeat_consumer(Arc::new(LoggingHeartbeatConsumer))
    .with_http_rpc_endpoint(rpc_url)
    .with_keystore_uri(keystore_uri)
    .with_status_registry_address(status_registry)
    .build();
```

### HeartbeatConfig

```rust
HeartbeatConfig {
    interval_secs,          // HEARTBEAT_INTERVAL_SECS, default 120
    jitter_percent: 10,
    service_id,             // SERVICE_ID or TANGLE_SERVICE_ID
    blueprint_id,           // BLUEPRINT_ID or TANGLE_BLUEPRINT_ID
    max_missed_heartbeats,  // HEARTBEAT_MAX_MISSED, default 3
    status_registry_address,// STATUS_REGISTRY_ADDRESS
}
```

### Metrics reported

The `OnChainMetrics::snapshot()` produces these key-value pairs:
- `total_jobs`, `avg_duration_ms`, `total_input_tokens`, `total_output_tokens`
- `active_sandboxes`, `peak_sandboxes`, `active_sessions`
- `allocated_cpu_cores`, `allocated_memory_mb`
- `failed_jobs`, `reaped_idle`, `reaped_lifetime`, `garbage_collected`
- `snapshots_committed`, `snapshots_uploaded`
- `gc_containers_removed`, `gc_images_removed`, `gc_s3_cleaned`

Plus per-endpoint HTTP metrics with histogram buckets and Prometheus-format rendering.

**Source:** `ai-agent-sandbox-blueprint-bin/src/main.rs` (lines 68-150, 478-514), `sandbox-runtime/src/metrics.rs`

---

## 17. Firecracker Runtime Backend

The runtime supports Firecracker microVMs as an alternative to Docker containers, using a host-agent API.

**Priority:** Only needed when deploying on bare-metal with microVM isolation.

### RuntimeBackend enum

```rust
enum RuntimeBackend {
    Docker,
    Firecracker,
    Tee,
}
```

Selected via `SANDBOX_RUNTIME_BACKEND` env var (default `"docker"`). Accepts `"docker"|"container"`, `"firecracker"|"microvm"`, `"tee"|"confidential"|"confidential-vm"`. Can be overridden per-sandbox via `metadata_json.runtime_backend`.

### Host-agent configuration

```rust
struct FirecrackerHostAgentConfig {
    base_url: String,           // FIRECRACKER_HOST_AGENT_URL or HOST_AGENT_URL
    api_key: Option<String>,    // FIRECRACKER_HOST_AGENT_API_KEY
    network: String,            // FIRECRACKER_HOST_AGENT_NETWORK, default "bridge"
    pids_limit: u64,            // FIRECRACKER_HOST_AGENT_PIDS_LIMIT, default 512
    sidecar_auth_token: Option<String>,  // FIRECRACKER_SIDECAR_AUTH_TOKEN
}
```

Sidecar auth is mutually exclusive: `FIRECRACKER_SIDECAR_AUTH_DISABLED=true` (no token) or `=false` + `FIRECRACKER_SIDECAR_AUTH_TOKEN=<token>`.

### Host-agent API

| Operation | Method | Path |
|-----------|--------|------|
| Create | POST | `/v1/containers` |
| Start | POST | `/v1/containers/{id}/start` |
| Get | GET | `/v1/containers/{id}` |
| Stop | POST | `/v1/containers/{id}/stop` |
| Delete | DELETE | `/v1/containers/{id}?force=true&removeVolumes=true` |
| Health | GET | `/v1/health` |

### Differences from Docker

- **Create:** Rejects `metadata_json.ports` port mappings. No SSH port. Persists `runtime_backend="firecracker"` in metadata.
- **Stop/Resume/Delete:** Calls Firecracker host-agent endpoints instead of Docker API. Resume polls `/health` with 30s timeout.

**Source:** `sandbox-runtime/src/firecracker.rs`, `sandbox-runtime/src/runtime.rs` (lines 955-981, 1012-1145)

---

## 18. Live Sessions (Terminal/Chat SSE)

The operator API provides real-time terminal output and chat message streaming via Server-Sent Events (SSE).

**Priority:** Required when the blueprint exposes interactive agent/terminal UX.

### Core types

```rust
struct LiveTerminalSession {
    id: String,
    scope_id: String,           // e.g. "sandbox:{id}" or "instance:{id}"
    owner: String,              // EVM address
    output_tx: broadcast::Sender<String>,
}

struct LiveChatSession<M> {
    id: String,
    scope_id: String,
    owner: String,
    title: String,
    messages: Vec<M>,
    events_tx: broadcast::Sender<LiveJsonEvent>,
}

struct LiveJsonEvent {
    event_type: String,
    payload: Value,
}
```

### Scope isolation

Sessions are scoped to `(scope_id, owner)` pairs:
- Multi-sandbox mode: `scope_id = "sandbox:{sandbox_id}"`
- Instance mode: `scope_id = "instance:{sandbox_id}"`

Matching verifies both scope and owner (case-insensitive address comparison).

### SSE streaming

`sse_from_terminal_output()` and `sse_from_json_events()` wrap `broadcast::Receiver` into Axum `Sse` responses with 15s keep-alive.

### API endpoints

**Multi-sandbox mode:**
- `GET /api/sandboxes/{id}/live/terminal/sessions` — list
- `GET /api/sandboxes/{id}/live/terminal/sessions/{session_id}/stream` — SSE
- `POST /api/sandboxes/{id}/live/terminal/sessions` — create
- `DELETE /api/sandboxes/{id}/live/terminal/sessions/{session_id}` — delete
- Same pattern for `/live/chat/sessions`

**Instance mode:** Same endpoints under `/api/sandbox/live/...` (no `{id}` path param).

**Source:** `sandbox-runtime/src/live_operator_sessions.rs`, `sandbox-runtime/src/operator_api.rs` (lines 2133-2219)

---

## 19. Scoped Session Auth

An instance-based (non-static) auth service supporting both wallet-signature and static access-token flows, with resource-scoped sessions.

**Priority:** Required when the operator API needs per-resource auth isolation (e.g., per-sandbox access control).

### How it differs from base session auth

| Feature | Base `session_auth` | Scoped `scoped_session_auth` |
|---------|--------------------|-----------------------------|
| State | Static globals | Instance-based (`ScopedAuthService::new()`) |
| Auth modes | Wallet signature only | Wallet signature + access token |
| Session scope | Address only | `(scope_id, owner)` pair |
| Claims | `address` | `Operator` (global) or `Scoped { scope_id, owner }` |
| Token format | PASETO v4.local | `{prefix}{uuid}` (e.g., `scope_<uuid>`) |

### Configuration

```rust
ScopedAuthConfig {
    challenge_ttl_secs,
    session_ttl_secs,
    access_token: Option<String>,       // Static access token for machine-to-machine
    operator_api_token: Option<String>,  // Operator-wide bearer token
    max_challenges,
    max_sessions,
    token_prefix: String,               // e.g. "scope_" or "acl_"
    challenge_message_header: String,
}
```

### Resource scoping

```rust
struct ScopedAuthResource {
    scope_id: String,       // e.g. "sandbox:{id}" or "instance:{id}"
    owner: String,          // EVM address (0x-prefixed)
    auth_mode: ScopedAuthMode,  // WalletSignature or AccessToken
}
```

**Source:** `sandbox-runtime/src/scoped_session_auth.rs`

---

## 20. Provision Progress Tracking

Tracks provisioning lifecycle phases with public (unauthenticated) endpoints for UI polling.

**Priority:** Required when provisioning takes >5 seconds and the UI needs progress feedback.

### Phases

```rust
enum ProvisionPhase {
    Queued,          // 0%
    ImagePull,       // 20%
    ContainerCreate, // 40%
    ContainerStart,  // 60%
    HealthCheck,     // 80%
    Ready,           // 100% (terminal)
    Failed,          // 0% (terminal)
}
```

### Status

```rust
struct ProvisionStatus {
    call_id: u64,
    sandbox_id: Option<String>,
    phase: ProvisionPhase,
    message: Option<String>,
    started_at: u64,
    updated_at: u64,
    progress_pct: u8,          // Auto-computed from phase
    sidecar_url: Option<String>,
    metadata: Value,           // Blueprint-specific (service_id, bot_id, etc.)
}
```

Persisted in `PersistentStore<ProvisionStatus>` at `{BLUEPRINT_STATE_DIR}/provisions.json`.

### API

- `GET /api/provisions` — list all (active + terminal)
- `GET /api/provisions/{call_id}` — single lookup

These are **unauthenticated** (rate-limited read-only) for pre-auth UI polling and liveness probes.

### Public functions

`start_provision(call_id)`, `update_provision(call_id, phase, message, sandbox_id, sidecar_url)`, `update_provision_metadata(call_id, metadata)`, `get_provision(call_id)`, `list_active_provisions()`, `list_all_provisions()`, `gc_provisions(max_age_secs)`.

**Source:** `sandbox-runtime/src/provision_progress.rs`, `sandbox-runtime/src/operator_api.rs` (lines 2293-2300)

---

## Quick Reference: Must Have vs Nice to Have

### Must have for production

1. **Operator API** -- HTTP server alongside job handlers
2. **BPM bridge** -- Proxy registration for production deployment
3. **Session auth** -- Wallet-based authentication
4. **Two-phase secrets** -- Keep credentials off-chain
5. **Circuit breaker** -- Prevent cascading failures
6. **Reaper/GC** -- Lifecycle management
7. **State management** -- Durable, encrypted persistent store
8. **Security hardening** -- Rate limiting, SSRF prevention, headers
9. **Configuration** -- Environment-based with validation

### Must have for instance blueprints

10. **Auto-provisioning from BSM** -- Read config, provision, report
11. **Direct lifecycle reporting** -- reportProvisioned/reportDeprovisioned with retry

### Nice to have

12. **Billing/escrow watchdog** -- Auto-deprovision on exhaustion
13. **TEE backends** -- Confidential computing support
14. **Shared runtime crate** -- When building multiple variants
15. **Comprehensive testing** -- Unit, integration, E2E, shell scripts
16. **QoS/Heartbeat** -- Liveness probes and on-chain metrics
17. **Firecracker backend** -- MicroVM isolation on bare metal
18. **Live sessions** -- Terminal/chat SSE streaming
19. **Scoped session auth** -- Per-resource auth isolation
20. **Provision progress** -- UI polling for provisioning status
