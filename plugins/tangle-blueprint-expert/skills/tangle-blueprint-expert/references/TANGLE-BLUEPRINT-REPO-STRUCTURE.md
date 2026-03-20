# Tangle Blueprint Repository Structure

The canonical blueprint layout separates library code (jobs, router, types, background services) from the binary entrypoint (main.rs wiring). This document covers the full repo structure, Cargo workspace layout, and the bin/lib split pattern.

**Source:** `vllm-inference-blueprint/`, `blueprint-template/`, `ai-agent-sandbox-blueprint/`

---

## 1. Minimal Layout (Single Crate)

For simple blueprints with one binary and no shared library consumers:

```
my-blueprint/
├── operator/
│   ├── src/
│   │   ├── lib.rs          # Router, sol! types, job handlers, BackgroundService
│   │   └── main.rs         # BlueprintRunner wiring
│   ├── Cargo.toml
│   └── tests/
│       └── anvil.rs        # Integration tests with BlueprintHarness
├── contracts/
│   ├── src/
│   │   └── MyBSM.sol       # Blueprint Service Manager contract
│   ├── test/
│   │   └── MyBSM.t.sol
│   └── foundry.toml
├── scripts/
│   ├── deploy-local.sh     # Deploy contracts to Anvil
│   └── test-e2e.sh         # Full E2E test suite
├── Cargo.toml              # Workspace root
└── .env.local              # Local dev config (never committed)
```

---

## 2. Production Layout (Multi-Module Crate)

For blueprints with HTTP servers, billing, health checks, and subprocess management:

```
vllm-inference-blueprint/
├── operator/
│   ├── src/
│   │   ├── lib.rs          # Router, sol! types, job handler, BackgroundService
│   │   ├── main.rs         # BlueprintRunner wiring, GPU detection, env load
│   │   ├── server.rs       # Axum HTTP server (OpenAI-compatible API)
│   │   ├── billing.rs      # Payment verification (Credits, RLN, x402)
│   │   ├── config.rs       # OperatorConfig (TOML deserialization)
│   │   ├── health.rs       # GPU detection, nvidia-smi/rocm-smi parsing
│   │   └── vllm.rs         # vLLM subprocess lifecycle management
│   ├── Cargo.toml
│   └── tests/
├── contracts/
│   ├── src/
│   │   ├── InferenceBSM.sol     # BSM with GPU validation in onRegister
│   │   ├── ShieldedCredits.sol  # Prepaid credit accounts (EIP-712)
│   │   └── RLNSettlement.sol    # Per-request batch settlement
│   ├── test/
│   ├── script/
│   │   └── Deploy.s.sol
│   └── foundry.toml
├── sdk/                     # TypeScript client SDK (optional)
│   └── shielded-sdk/
├── scripts/
│   ├── deploy-local.sh
│   ├── test-e2e.sh
│   └── test-full-protocol.sh
├── deploy/
│   └── config/
│       └── local.json       # Deployment config
├── config/
│   └── pricing.toml         # RFQ pricing config
├── Cargo.toml               # Workspace root
├── docker-compose.yml       # vLLM + operator dev setup
└── .env.local
```

---

## 3. Workspace Layout (Separate Lib + Bin Crates)

For blueprints where the library is consumed by multiple binaries or by tests independently:

```
my-blueprint/
├── my-blueprint-lib/
│   ├── src/
│   │   ├── lib.rs           # Public: router(), job handlers, sol! types
│   │   ├── context.rs       # AppContext, KeystoreContext derive
│   │   └── services.rs      # BackgroundService implementations
│   ├── Cargo.toml
│   └── tests/
│       ├── e2e.rs
│       └── integration.rs
├── my-blueprint-bin/
│   ├── src/
│   │   └── main.rs          # BlueprintRunner wiring only
│   └── Cargo.toml
├── contracts/
│   └── ...
├── Cargo.toml               # Workspace members
└── ...
```

**Workspace Cargo.toml:**

```toml
[workspace]
members = ["my-blueprint-lib", "my-blueprint-bin"]
resolver = "2"

[workspace.dependencies]
blueprint-sdk = { version = "0.1.0-alpha.22", features = ["std", "tangle", "macros"] }
```

---

## 4. The lib.rs Pattern

`lib.rs` is the blueprint's public API. It exports:

1. **sol! types** — ABI-encoded input/output structs
2. **Job constants** — `pub const MY_JOB: u8 = 0;`
3. **Router factory** — `pub fn router() -> Router`
4. **BackgroundService impl** — long-running services (HTTP servers, subprocesses)

```rust
// operator/src/lib.rs

pub mod billing;
pub mod config;
pub mod health;
pub mod vllm;

mod server;  // Private — only used by BackgroundService

use alloy_sol_types::sol;
use blueprint_sdk::macros::debug_job;
use blueprint_sdk::router::Router;
use blueprint_sdk::runner::BackgroundService;
use blueprint_sdk::tangle::extract::{TangleArg, TangleResult};
use blueprint_sdk::tangle::layers::TangleLayer;

// ─── ABI types ────────────────────────────────────────────────────────────

sol! {
    struct InferenceRequest {
        string prompt;
        uint32 maxTokens;
        uint64 temperature;
    }

    struct InferenceResult {
        string text;
        uint32 promptTokens;
        uint32 completionTokens;
    }
}

// ─── Job IDs ──────────────────────────────────────────────────────────────

pub const INFERENCE_JOB: u8 = 0;

// ─── Router ───────────────────────────────────────────────────────────────

pub fn router() -> Router {
    Router::new().route(INFERENCE_JOB, run_inference.layer(TangleLayer))
}

// ─── Job handler ──────────────────────────────────────────────────────────

#[debug_job]
pub async fn run_inference(
    TangleArg(request): TangleArg<InferenceRequest>,
) -> TangleResult<InferenceResult> {
    // Call the subprocess/API, return result
    TangleResult(InferenceResult { /* ... */ })
}

// ─── BackgroundService ────────────────────────────────────────────────────

#[derive(Clone)]
pub struct InferenceServer {
    pub config: Arc<OperatorConfig>,
}

impl BackgroundService for InferenceServer {
    async fn start(&self) -> Result<Receiver<Result<(), RunnerError>>, RunnerError> {
        let (tx, rx) = oneshot::channel();
        let config = self.config.clone();

        tokio::spawn(async move {
            // 1. Start subprocess (vLLM, Ollama, etc.)
            // 2. Wait for readiness
            // 3. Start HTTP server
            // 4. Keep tx open (signals "alive" to runner)
        });

        Ok(rx)
    }
}
```

---

## 5. The main.rs Pattern

`main.rs` is pure wiring — no business logic. It:

1. Sets up logging
2. Runs pre-flight checks (GPU detection, config validation)
3. Loads `BlueprintEnvironment`
4. Creates the `BackgroundService`
5. Builds and runs `BlueprintRunner`

```rust
// operator/src/main.rs

use blueprint_sdk::runner::config::BlueprintEnvironment;
use blueprint_sdk::runner::tangle::config::TangleConfig;
use blueprint_sdk::runner::BlueprintRunner;

fn setup_log() {
    use tracing_subscriber::{fmt, EnvFilter};
    fmt().with_env_filter(EnvFilter::from_default_env()).init();
}

#[tokio::main]
async fn main() -> Result<(), blueprint_sdk::Error> {
    setup_log();

    // Pre-flight: GPU detection (non-fatal)
    match my_lib::health::detect_gpus().await {
        Ok(gpus) => tracing::info!(count = gpus.len(), "detected GPUs"),
        Err(e) => tracing::warn!(error = %e, "no GPU — CPU mode"),
    }

    // Load config
    let config = Arc::new(my_lib::config::OperatorConfig::load(None)
        .map_err(|e| blueprint_sdk::Error::Other(format!("{e}")))?);

    // Load blueprint environment
    let env = BlueprintEnvironment::load()?;

    // Create background service
    let server = my_lib::InferenceServer { config };

    // Build and run
    BlueprintRunner::builder(TangleConfig::default(), env)
        .router(my_lib::router())
        .background_service(server)
        .run()
        .await
}
```

---

## 6. Contracts Layout

```
contracts/
├── src/
│   └── MyBSM.sol              # Extends BlueprintServiceManagerBase
├── test/
│   └── MyBSM.t.sol            # Foundry tests
├── script/
│   └── Deploy.s.sol           # Forge deployment script
├── lib/                       # soldeer/forge dependencies
├── foundry.toml
└── remappings.txt
```

The BSM contract hooks into the tnt-core lifecycle:

```solidity
contract InferenceBSM is BlueprintServiceManagerBase {
    // Validate GPU at registration
    function onRegister(bytes calldata registrationInputs, address operator)
        public payable override onlyRootChain { /* ... */ }

    // Service provisioning
    function onRequest(bytes calldata requestInputs, address requester)
        public payable override onlyRootChain { /* ... */ }

    // Cleanup on termination
    function onServiceTermination(uint64 serviceId)
        public override onlyRootChain { /* ... */ }
}
```

---

## 7. Scripts Layout

```
scripts/
├── deploy-local.sh          # Deploy contracts to Anvil, capture addresses
├── test-e2e.sh              # Full E2E: deploy → register → request → job
└── test-full-protocol.sh    # Against real tnt-core state snapshot
```

**deploy-local.sh pattern:**

```bash
#!/bin/bash
set -euo pipefail

anvil --block-time 1 &
ANVIL_PID=$!
sleep 2

# Deploy contracts, capture addresses
DEPLOY_OUTPUT=$(forge script script/Deploy.s.sol:Deploy \
    --rpc-url http://localhost:8545 \
    --private-key $PRIVATE_KEY \
    --broadcast 2>&1)

BSM_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "BSM:" | awk '{print $2}')
echo "BSM=$BSM_ADDRESS" > .env.deploy

kill $ANVIL_PID
```

---

## 8. Configuration Pattern

Operator config uses TOML with env var overrides:

```toml
# config/operator.toml

[server]
host = "0.0.0.0"
port = 8080
max_concurrent_requests = 10

[vllm]
host = "127.0.0.1"
port = 8000
model = "Qwen/Qwen2-0.5B"
gpu_memory_utilization = 0.9

[tangle]
rpc_url = "http://localhost:8545"
bsm_address = "0x..."
operator_key = "${OPERATOR_PRIVATE_KEY}"
```

```rust
// operator/src/config.rs

#[derive(Debug, Clone, Deserialize)]
pub struct OperatorConfig {
    pub server: ServerConfig,
    pub vllm: VllmConfig,
    pub tangle: TangleConfig,
}

impl OperatorConfig {
    pub fn load(path: Option<&str>) -> anyhow::Result<Self> {
        let path = path.unwrap_or("config/operator.toml");
        let content = std::fs::read_to_string(path)?;
        Ok(toml::from_str(&content)?)
    }
}
```
