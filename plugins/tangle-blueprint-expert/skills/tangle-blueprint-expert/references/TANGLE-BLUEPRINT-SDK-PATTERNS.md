# Tangle Blueprint SDK Programming Patterns

The Blueprint SDK is a Rust framework for building on-chain services ("blueprints") on Tangle Network. It follows an axum-inspired architecture: you define async handler functions that extract typed inputs from job calls, route them by job ID, and wire everything together with a producer/consumer pipeline that reads events from and writes results to EVM contracts. This document covers every pattern a Rust developer needs to build a working blueprint, with code taken directly from the SDK and its example blueprints.

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Router Pattern](#2-router-pattern)
3. [Job Handlers](#3-job-handlers)
4. [TangleArg and TangleResult](#4-tanglearg-and-tangleresult)
5. [The sol! Macro](#5-the-sol-macro)
6. [TangleLayer](#6-tanglelayer)
7. [BlueprintRunner Builder](#7-blueprintrunner-builder)
8. [Complete main.rs Boilerplate](#8-complete-mainrs-boilerplate)
9. [BlueprintEnvironment](#9-blueprintenvironment)
10. [Caller Extractor and Other Metadata](#10-caller-extractor-and-other-metadata)
11. [BackgroundService Trait](#11-backgroundservice-trait)
12. [Context System and Dependency Injection](#12-context-system-and-dependency-injection)
13. [Multi-Protocol Support](#13-multi-protocol-support)
14. [FaaS Execution Model](#14-faas-execution-model)
15. [Testing Patterns](#15-testing-patterns)

---

## 1. Project Structure

A blueprint is typically split into two crates: a library crate (jobs, router, types) and a binary crate (main.rs wiring). The hello-tangle example demonstrates the minimal layout:

```
hello-tangle/
  src/lib.rs          # Job handlers, router, sol! types
  tests/anvil.rs      # Integration test with BlueprintHarness
  Cargo.toml
```

The incredible-squaring example uses a workspace with separate lib and bin crates:

```
incredible-squaring/
  incredible-squaring-lib/
    src/lib.rs                    # Jobs, router, BackgroundService
    src/faas_handler.rs           # FaaS-compatible handler
    tests/e2e.rs                  # Unit/integration tests
    tests/integration.rs          # Aggregation tests
  incredible-squaring-bin/
    src/main.rs                   # Runner wiring
```

**Source:** `examples/hello-tangle/`, `examples/incredible-squaring/`

---

## 2. Router Pattern

The `Router` is axum-inspired. You create one with `Router::new()` and add routes with `.route(JOB_ID, handler)`. Each route maps a numeric job ID to a handler function. The router implements `tower::Service<JobCall>`.

**Source:** `crates/router/src/routing.rs`

### Basic routing

From `examples/hello-tangle/src/lib.rs`:

```rust
use blueprint_router::Router;

pub const CREATE_DOCUMENT_JOB: u8 = 0;

pub fn router() -> Router {
    Router::new().route(CREATE_DOCUMENT_JOB, create_document)
}
```

**Note:** This minimal example omits `TangleLayer`. In production binaries, always apply `TangleLayer` (see next section) -- without it, the consumer cannot route results back to the correct on-chain call.

### Routing with layers

From `examples/incredible-squaring/incredible-squaring-lib/src/lib.rs`:

```rust
pub fn router() -> Router {
    Router::new()
        .route(XSQUARE_JOB_ID, square.layer(TangleLayer))
        .route(VERIFIED_XSQUARE_JOB_ID, verified_square.layer(TangleLayer))
        .route(CONSENSUS_XSQUARE_JOB_ID, consensus_square.layer(TangleLayer))
        .route(XSQUARE_FAAS_JOB_ID, square_faas.layer(TangleLayer))
        .route(VERIFIED_XSQUARE_FAAS_JOB_ID, verified_square_faas.layer(TangleLayer))
}
```

### The `.always()` method

For handlers that should receive every job call regardless of ID:

```rust
Router::new()
    .always(my_handler)
    .with_context(app_context)
```

### Other routing methods

- `.fallback(handler)` -- called when no other route matches and no `.always()` route exists.
- `.route_service(job_id, tower_service)` -- mount an arbitrary `tower::Service` instead of a handler function.
- `.layer(tower_layer)` -- apply a `tower::Layer` to all routes globally.

**Source:** `crates/router/src/routing.rs`, lines 60-196

---

## 3. Job Handlers

Job handlers are async functions whose arguments are extractors. The return type must implement `IntoJobResult`. The simplest handler takes `TangleArg<T>` and returns `TangleResult<T>`.

**Source:** `examples/incredible-squaring/incredible-squaring-lib/src/lib.rs`

### Minimal handler (primitive types)

```rust
use blueprint_sdk::tangle::extract::{TangleArg, TangleResult};

pub async fn square(TangleArg((x,)): TangleArg<(u64,)>) -> TangleResult<u64> {
    let result = x * x;
    TangleResult(result)
}
```

Note the tuple pattern: `TangleArg<(u64,)>` wraps a single-element tuple. The ABI encoding/decoding treats this as a single `uint64` parameter.

### Handler with multiple inputs

From `examples/apikey-blueprint/apikey-blueprint-lib/src/lib.rs`:

```rust
pub async fn write_resource(
    TangleArg((resource_id, data, account)): TangleArg<(String, String, Address)>,
) -> TangleResult<WriteResourceResult> {
    // ...
}
```

### Handler with struct inputs (via sol!)

From `examples/hello-tangle/src/lib.rs`:

```rust
pub async fn create_document(
    Caller(caller): Caller,
    TangleArg(request): TangleArg<DocumentRequest>,
) -> TangleResult<DocumentReceipt> {
    // ...
}
```

### Handler with Context

Handlers can receive injected context via the `Context` extractor:

```rust
pub async fn my_handler(
    Context(ctx): Context<AppContext>,
    TangleArg((x,)): TangleArg<(u64,)>,
) -> TangleResult<u64> {
    // Access ctx fields
    TangleResult(x * x)
}
```

### The #[debug_job] macro

Annotating a handler with `#[debug_job]` adds debug tracing in debug builds. It is a no-op in release builds.

```rust
use blueprint_sdk::macros::debug_job;

#[debug_job]
pub async fn square(TangleArg((x,)): TangleArg<(u64,)>) -> TangleResult<u64> {
    TangleResult(x * x)
}
```

**Source:** `crates/macros/src/lib.rs`, line 170

---

## 4. TangleArg and TangleResult

These are the primary extractors for Tangle job inputs and outputs. They handle ABI encoding/decoding automatically via `alloy_sol_types::SolValue`.

**Source:** `crates/tangle-extra/src/extract/mod.rs`

### TangleArg<T>

Extracts and ABI-decodes the job call body into type `T`. Supports two encoding formats:

1. **ABI encoding** -- standard Ethereum format (used with `--payload-hex`)
2. **Compact binary** -- Tangle's native format (used with `--params-file`)

The extractor uses heuristics to auto-detect the format.

`T` must implement `alloy_sol_types::SolValue`. Common types:
- Primitives: `u64`, `u128`, `U256`, `bool`, `String`, `Address`
- Tuples: `(u64,)`, `(String, Address)`, `(String, String, Address)`
- sol! structs: any struct defined with `alloy_sol_types::sol!`

```rust
// Single primitive
TangleArg((x,)): TangleArg<(u64,)>

// Multiple primitives as tuple
TangleArg((name, addr)): TangleArg<(String, Address)>

// Struct defined via sol!
TangleArg(request): TangleArg<DocumentRequest>
```

### TangleResult<T>

Wraps the return value and ABI-encodes it via `SolValue::abi_encode`. Implements `IntoJobResult`, which is what the runner expects from handler return types.

```rust
// From the implementation:
impl<T: SolValue> blueprint_core::IntoJobResult for TangleResult<T> {
    fn into_job_result(self) -> Option<blueprint_core::JobResult> {
        let encoded = self.0.abi_encode();
        Some(blueprint_core::JobResult::Ok {
            head: blueprint_core::job::result::Parts::new(),
            body: Bytes::from(encoded),
        })
    }
}
```

**Source:** `crates/tangle-extra/src/extract/mod.rs`, lines 762-921

---

## 5. The sol! Macro

Use `alloy_sol_types::sol!` to define Solidity-compatible struct types that can be ABI-encoded/decoded. These types implement `SolValue` and can be used directly with `TangleArg` and `TangleResult`.

**Source:** `examples/hello-tangle/src/lib.rs`

### Defining input/output structs

```rust
use alloy_sol_types::sol;

sol! {
    /// Input payload sent from the Tangle contract.
    struct DocumentRequest {
        string docId;
        string contents;
    }

    /// Output payload returned back to the caller.
    struct DocumentReceipt {
        string docId;
        string contents;
        string operator;
    }
}
```

**Source:** `examples/apikey-blueprint/apikey-blueprint-lib/src/lib.rs`

```rust
sol! {
    struct WriteResourceResult {
        bool ok;
        string resourceId;
        string account;
    }

    struct PurchaseApiKeyResult {
        bool ok;
        string apiKeyHash;
    }
}
```

### sol! with contract bindings

You can generate full contract bindings from compiled Solidity JSON artifacts:

```rust
sol!(
    #[allow(missing_docs, clippy::too_many_arguments)]
    #[sol(rpc)]
    #[derive(Debug, Serialize, Deserialize)]
    MyContract,
    "contracts/out/MyContract.sol/MyContract.json"
);
```

### Using sol! types in handlers

```rust
pub async fn create_document(
    Caller(caller): Caller,
    TangleArg(request): TangleArg<DocumentRequest>,
) -> TangleResult<DocumentReceipt> {
    TangleResult(DocumentReceipt {
        docId: request.docId,
        contents: request.contents,
        operator: format!("{:#x}", Address::from_slice(&caller)),
    })
}
```

---

## 6. TangleLayer

`TangleLayer` is a `tower::Layer` that extracts `call_id` and `service_id` from incoming `JobCall` metadata and attaches them to the outgoing `JobResult` metadata. This is what allows `TangleConsumer` to know which contract call to submit results for.

**Source:** `crates/tangle-extra/src/layers.rs`

### How it works

When a `JobCall` arrives from `TangleProducer`, it carries metadata like `X-TANGLE-CALL-ID` and `X-TANGLE-SERVICE-ID`. The `TangleLayer` intercepts the call, extracts these values, runs the inner handler, and attaches the same IDs to the result so `TangleConsumer` can route the submission correctly.

If the metadata is missing (e.g., a non-Tangle job call), the layer returns `None` (no result), silently skipping the call.

### Applying TangleLayer

Per-route (recommended):

```rust
Router::new()
    .route(JOB_ID, my_handler.layer(TangleLayer))
```

Globally (applies to all routes):

```rust
Router::new()
    .route(JOB_0, handler_a)
    .route(JOB_1, handler_b)
    .layer(TangleLayer)
```

---

## 7. BlueprintRunner Builder

`BlueprintRunner::builder(config, env)` creates a `BlueprintRunnerBuilder` that wires together the router, producers, consumers, background services, and shutdown handlers.

**Source:** `crates/runner/src/lib.rs`, lines 148-200, 862-883

### Builder methods

| Method | Purpose |
|--------|---------|
| `.router(router)` | Set the Router (required) |
| `.producer(stream)` | Add a producer (yields `JobCall`s) |
| `.consumer(sink)` | Add a consumer (receives `JobResult`s) |
| `.background_service(svc)` | Add a BackgroundService |
| `.with_shutdown_handler(future)` | Custom shutdown logic |
| `.run().await` | Start the runner |

### Typical wiring

From `examples/incredible-squaring/incredible-squaring-bin/src/main.rs`:

```rust
BlueprintRunner::builder(tangle_config, env)
    .router(router())
    .background_service(FooBackgroundService)
    .producer(tangle_producer)
    .consumer(tangle_consumer)
    .with_shutdown_handler(async { println!("Shutting down!") })
    .run()
    .await?;
```

### Config types

The first argument to `builder()` is a `BlueprintConfig` implementation. Common options:

- `TangleConfig::default()` -- for Tangle blueprints
- `()` -- no protocol-specific config (unit type implements `BlueprintConfig`)

---

## 8. Complete main.rs Boilerplate

This is the full main.rs pattern for a Tangle blueprint, taken from `examples/incredible-squaring/incredible-squaring-bin/src/main.rs`:

```rust
use blueprint_sdk::contexts::tangle::TangleClientContext;
use blueprint_sdk::runner::BlueprintRunner;
use blueprint_sdk::runner::config::BlueprintEnvironment;
use blueprint_sdk::runner::tangle::config::TangleConfig;
use blueprint_sdk::tangle::{TangleConsumer, TangleProducer};
use blueprint_sdk::{error, info};

fn setup_log() {
    use tracing_subscriber::{EnvFilter, fmt};
    let filter = EnvFilter::from_default_env();
    fmt().with_env_filter(filter).init();
}

#[tokio::main]
async fn main() -> Result<(), blueprint_sdk::Error> {
    setup_log();

    // 1. Load environment (CLI args, env vars, keystore)
    let env = BlueprintEnvironment::load()?;

    // 2. Create a Tangle client from environment
    let tangle_client = env
        .tangle_client()
        .await
        .map_err(|e| blueprint_sdk::Error::Other(e.to_string()))?;

    // 3. Get the service ID from protocol settings
    let service_id = env
        .protocol_settings
        .tangle()
        .map_err(|e| blueprint_sdk::Error::Other(e.to_string()))?
        .service_id
        .ok_or_else(|| blueprint_sdk::Error::Other("No service ID configured".to_string()))?;

    // 4. Create producer (polls for JobSubmitted events)
    let tangle_producer = TangleProducer::new(tangle_client.clone(), service_id);

    // 5. Create consumer (submits results via submitResult)
    let tangle_consumer = TangleConsumer::new(tangle_client.clone());

    // 6. Build and run
    let tangle_config = TangleConfig::default();

    BlueprintRunner::builder(tangle_config, env)
        .router(my_lib::router())
        .producer(tangle_producer)
        .consumer(tangle_consumer)
        .with_shutdown_handler(async { info!("Shutting down") })
        .run()
        .await?;

    Ok(())
}
```

**Source:** `examples/incredible-squaring/incredible-squaring-bin/src/main.rs`

---

## 9. BlueprintEnvironment

`BlueprintEnvironment::load()` parses CLI arguments and environment variables to build the runtime configuration. It uses `clap::Parser` under the hood.

**Source:** `crates/runner/src/config.rs`

### Key fields

- `http_rpc_endpoint: Url` -- HTTP RPC endpoint for the chain
- `ws_rpc_endpoint: Url` -- WebSocket RPC endpoint
- `keystore_uri: String` -- Path to the keystore
- `data_dir: PathBuf` -- Data directory for the blueprint
- `protocol_settings: ProtocolSettings` -- Protocol-specific settings
- `test_mode: bool` -- Whether running in test mode
- `dry_run: bool` -- Skip on-chain submissions

### Getting a Tangle client

The `TangleClientContext` trait (implemented on `BlueprintEnvironment`) provides:

```rust
let tangle_client = env.tangle_client().await?;
```

This creates a `TangleClient` configured with the environment's RPC endpoint, keystore, and protocol settings.

**Source:** `crates/contexts/src/tangle.rs`

### Getting protocol settings

```rust
let tangle_settings = env.protocol_settings.tangle()?;
let service_id = tangle_settings.service_id;
let blueprint_id = tangle_settings.blueprint_id;
```

### Registration mode

Blueprints can detect if they are running in registration mode:

```rust
if env.registration_mode() {
    let payload = my_registration_payload();
    registration::write_registration_inputs(&env, payload).await?;
    return Ok(());
}
```

**Source:** `examples/apikey-blueprint/apikey-blueprint-bin/src/main.rs`, lines 23-32

---

## 10. Caller Extractor and Other Metadata

The `TangleProducer` populates `JobCall` metadata from on-chain events. Extractors pull typed values from this metadata.

**Source:** `crates/tangle-extra/src/extract/mod.rs`

### Available extractors

| Extractor | Type | Metadata Key | Description |
|-----------|------|-------------|-------------|
| `Caller` | `[u8; 20]` | `X-TANGLE-CALLER` | Address that submitted the job |
| `CallId` | `u64` | `X-TANGLE-CALL-ID` | Unique call identifier |
| `ServiceId` | `u64` | `X-TANGLE-SERVICE-ID` | Service the job belongs to |
| `JobIndex` | `u8` | `X-TANGLE-JOB-INDEX` | Index of the job within the service |
| `BlockNumber` | `u64` | `X-TANGLE-BLOCK-NUMBER` | Block where the event was emitted |
| `BlockHash` | `[u8; 32]` | `X-TANGLE-BLOCK-HASH` | Hash of the block |
| `Timestamp` | `u64` | `X-TANGLE-TIMESTAMP` | Block timestamp |

### Using the Caller extractor

From `examples/hello-tangle/src/lib.rs`:

```rust
use blueprint_tangle_extra::extract::{Caller, TangleArg, TangleResult};

pub async fn create_document(
    Caller(caller): Caller,
    TangleArg(request): TangleArg<DocumentRequest>,
) -> TangleResult<DocumentReceipt> {
    let caller_address = Address::from_slice(&caller);
    // ...
}
```

The `Caller` struct also has a convenience method:

```rust
let address: Address = caller.as_address();
```

### Optional extractors

All metadata extractors support `Option<T>` -- if the metadata key is missing, the extractor returns `None` instead of failing:

```rust
// Won't fail if caller metadata is absent
async fn my_handler(caller: Option<Caller>) -> TangleResult<u64> {
    if let Some(Caller(addr)) = caller {
        // handle caller
    }
    TangleResult(42)
}
```

---

## 11. BackgroundService Trait

Background services run alongside job processing. They are useful for HTTP servers, periodic tasks, aggregation services, etc.

**Source:** `crates/runner/src/lib.rs`, lines 104-136

### Trait definition

```rust
pub trait BackgroundService: Send + Sync {
    async fn start(&self) -> Result<oneshot::Receiver<Result<(), RunnerError>>, RunnerError>;
}
```

The `start()` method returns a `oneshot::Receiver` that signals when the service stops (either successfully or with an error).

### Minimal example

From `examples/incredible-squaring/incredible-squaring-lib/src/lib.rs`:

```rust
use blueprint_sdk::runner::BackgroundService;
use blueprint_sdk::runner::error::RunnerError;
use tokio::sync::oneshot::Receiver;

#[derive(Clone)]
pub struct FooBackgroundService;

impl BackgroundService for FooBackgroundService {
    async fn start(&self) -> Result<Receiver<Result<(), RunnerError>>, RunnerError> {
        let (tx, rx) = oneshot::channel();
        tokio::spawn(async move {
            let _ = tx.send(Ok(()));
        });
        Ok(rx)
    }
}
```

### HTTP server as BackgroundService

From `examples/apikey-blueprint/apikey-blueprint-lib/src/lib.rs`:

```rust
#[derive(Clone)]
pub struct ApiKeyProtectedService;

impl BackgroundService for ApiKeyProtectedService {
    async fn start(&self) -> Result<Receiver<Result<(), RunnerError>>, RunnerError> {
        let (tx, rx) = oneshot::channel();

        tokio::spawn(async move {
            let app = HttpRouter::new()
                .route("/health", get(|| async { Json("ok") }))
                .route("/api/resources", post(create_resource))
                .route("/api/resources/{id}", get(get_resource))
                .layer(middleware::from_fn(api_auth));

            let listener = tokio::net::TcpListener::bind("127.0.0.1:8081")
                .await
                .expect("failed to bind listener");

            let _ = tx.send(Ok(()));
            let _ = axum::serve(listener, app).await;
        });

        Ok(rx)
    }
}
```

### Wiring into the runner

```rust
BlueprintRunner::builder(tangle_config, env)
    .router(router())
    .background_service(ApiKeyProtectedService)
    .background_service(FooBackgroundService)
    .producer(tangle_producer)
    .consumer(tangle_consumer)
    .run()
    .await?;
```

---

## 12. Context System and Dependency Injection

The context system lets you inject shared state into job handlers. A `Router<Ctx>` is parameterized by its missing context type. You provide the context with `.with_context(value)`, which resolves the type parameter to `()`.

**Source:** `crates/router/docs/with_context.md`

### Basic usage

```rust
use blueprint_sdk::{Router, extract::Context};

#[derive(Clone)]
struct AppContext {
    db: DatabasePool,
}

const MY_JOB_ID: u8 = 0;

let router = Router::new()
    .route(MY_JOB_ID, |Context(ctx): Context<AppContext>| async {
        // use ctx.db
    })
    .with_context(AppContext { db: pool });
```

### Type semantics

`Router<Ctx>` means a router that is **missing** a context of type `Ctx`. Only `Router<()>` (no missing context) can be passed to `BlueprintRunner`. Calling `.with_context(value)` transitions the type:

```rust
let router: Router<AppContext> = Router::new()
    .route(MY_JOB_ID, |_: Context<AppContext>| async {});

let router: Router<()> = router.with_context(AppContext {});
// Now it can be passed to BlueprintRunner
```

### Returning routers from functions

The recommended pattern is to defer `.with_context()` to the call site:

```rust
fn routes() -> Router<AppContext> {
    Router::new()
        .route(MY_JOB_ID, |_: Context<AppContext>| async {})
}

// In main:
let router = routes().with_context(AppContext { /* ... */ });
```

### KeystoreContext derive macro

For contexts that need keystore access, use the `#[derive(KeystoreContext)]` macro with a `#[config]` field:

```rust
use blueprint_sdk::macros::context::KeystoreContext;
use blueprint_sdk::runner::config::BlueprintEnvironment;

#[derive(Clone, KeystoreContext)]
pub struct MyContext {
    pub db: DatabasePool,
    #[config]
    pub std_config: BlueprintEnvironment,
}
```

---

## 13. Multi-Protocol Support

The SDK supports multiple execution protocols. The protocol is selected via feature flags and determines which `BlueprintConfig`, producer, and consumer implementations are used.

### Tangle (EVM v2)

The primary protocol. Uses `TangleProducer` (polls for `JobSubmitted` events), `TangleConsumer` (calls `submitResult`), and `TangleConfig`.

```rust
use blueprint_sdk::runner::tangle::config::TangleConfig;
use blueprint_sdk::tangle::{TangleProducer, TangleConsumer};

let config = TangleConfig::default();
let producer = TangleProducer::new(client.clone(), service_id);
let consumer = TangleConsumer::new(client);
```

### Generic EVM

For custom EVM-based protocols, the `PollingProducer` can poll any contract for events. Combined with a custom consumer sink, this enables arbitrary EVM protocol support.

### Feature flags

Enable protocol support in `Cargo.toml`:

```toml
[dependencies]
blueprint-sdk = { version = "...", features = ["tangle"] }
# or for generic EVM polling:
blueprint-sdk = { version = "...", features = ["evm"] }
```

---

## 14. FaaS Execution Model

Blueprints can define jobs that run on serverless infrastructure (AWS Lambda, GCP Cloud Functions) instead of on the operator's machine. The job logic is identical; only the execution location differs.

**Source:** `examples/incredible-squaring/incredible-squaring-lib/src/lib.rs`, `src/faas_handler.rs`

### FaaS vs Local jobs

The incredible-squaring example demonstrates a 2x2 matrix of execution location and aggregation:

| Execution | Aggregation | Job ID | Function |
|-----------|-------------|--------|----------|
| Local     | Single (1)  | 0      | `square` |
| Local     | Multi (2)   | 1      | `verified_square` |
| Local     | Multi (3)   | 2      | `consensus_square` |
| FaaS      | Single (1)  | 3      | `square_faas` |
| FaaS      | Multi (2)   | 4      | `verified_square_faas` |

FaaS handlers have the same function signature as local handlers:

```rust
#[debug_job]
pub async fn square_faas(TangleArg((x,)): TangleArg<(u64,)>) -> TangleResult<u64> {
    let result = x * x;
    TangleResult(result)
}
```

### WASM-compatible FaaS handler

For deployment to serverless runtimes, extract the core logic into a synchronous, WASM-compatible function:

From `examples/incredible-squaring/incredible-squaring-lib/src/faas_handler.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FaasInput {
    pub job_id: u32,
    pub x: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FaasOutput {
    pub result: u64,
}

pub fn execute_square(x: u64) -> u64 {
    x * x
}

pub fn handle_request(input: FaasInput) -> FaasOutput {
    FaasOutput {
        result: execute_square(input.x),
    }
}
```

---

## 15. Testing Patterns

### Unit testing handlers directly

Job handlers can be called directly in tests by constructing extractor types manually:

From `examples/incredible-squaring/incredible-squaring-lib/tests/e2e.rs`:

```rust
use blueprint_sdk::tangle::extract::{TangleArg, TangleResult};

#[tokio::test]
async fn test_square_function() {
    let result: TangleResult<u64> = square(TangleArg((5u64,))).await;
    assert_eq!(*result, 25);
}
```

### Testing the full encode/decode flow

```rust
use alloy_sol_types::SolValue;
use blueprint_sdk::{FromJobCall, IntoJobResult, JobCall, JobResult};
use blueprint_sdk::tangle::extract::{TangleArg, TangleResult};

#[tokio::test]
async fn test_full_job_flow() {
    // 1. ABI-encode the input (simulates what the contract sends)
    let input: u64 = 7;
    let encoded_input = input.abi_encode();

    // 2. Create a JobCall (simulates what TangleProducer emits)
    let job_call = JobCall::new(XSQUARE_JOB_ID, bytes::Bytes::from(encoded_input));

    // 3. Extract the argument (simulates what the router does)
    let TangleArg((x,)): TangleArg<(u64,)> =
        TangleArg::from_job_call(job_call, &()).await.unwrap();
    assert_eq!(x, 7);

    // 4. Call the handler
    let result: TangleResult<u64> = square(TangleArg((x,))).await;
    assert_eq!(*result, 49);

    // 5. Convert to JobResult (simulates what the runner does)
    let job_result = result.into_job_result().unwrap();
    if let JobResult::Ok { body, .. } = job_result {
        let decoded = u64::abi_decode(&body).unwrap();
        assert_eq!(decoded, 49);
    }
}
```

**Source:** `examples/incredible-squaring/incredible-squaring-lib/tests/e2e.rs`, lines 189-221

### Integration testing with BlueprintHarness (Anvil-backed)

The `BlueprintHarness` provides a full end-to-end test environment with a local Anvil node, deployed contracts, and a running blueprint runner.

From `examples/hello-tangle/tests/anvil.rs`:

```rust
use blueprint_anvil_testing_utils::{BlueprintHarness, missing_tnt_core_artifacts};
use alloy_primitives::Bytes;
use alloy_sol_types::SolValue;

#[tokio::test(flavor = "multi_thread", worker_threads = 4)]
async fn creates_and_reads_documents() -> Result<()> {
    // Build the harness from your router
    let harness = BlueprintHarness::builder(router())
        .poll_interval(std::time::Duration::from_millis(50))
        .spawn()
        .await?;

    // ABI-encode the input payload
    let payload = DocumentRequest {
        docId: "doc-42".to_string(),
        contents: "hello-tangle".to_string(),
    }.abi_encode();

    // Submit a job and wait for the result
    let submission = harness
        .submit_job(CREATE_DOCUMENT_JOB, Bytes::from(payload))
        .await?;
    let output = harness.wait_for_job_result(submission).await?;

    // Decode and verify the result
    let receipt = DocumentReceipt::abi_decode(&output)?;
    assert_eq!(receipt.docId, "doc-42");

    harness.shutdown().await;
    Ok(())
}
```

**Source:** `examples/hello-tangle/tests/anvil.rs`, `crates/testing-utils/anvil/src/blueprint.rs`

### BlueprintHarness builder options

```rust
BlueprintHarness::builder(router)
    .poll_interval(Duration::from_millis(50))   // How often to poll for events
    .blueprint_id(42)                           // Custom blueprint ID
    .service_id(1)                              // Custom service ID
    .with_env_vars(vec![("KEY".into(), "VALUE".into())])  // Set env vars for the test
    .spawn()
    .await?;
```

### Handling missing test artifacts

Foundry contract artifacts may not be compiled in all environments. Use the `missing_tnt_core_artifacts` helper to gracefully skip tests:

```rust
let harness = match BlueprintHarness::builder(router()).spawn().await {
    Ok(harness) => harness,
    Err(err) => {
        if missing_tnt_core_artifacts(&err) {
            eprintln!("Skipping test: {err}");
            return Ok(());
        }
        return Err(err);
    }
};
```

### Testing BackgroundService implementations

```rust
use blueprint_sdk::runner::BackgroundService;

#[tokio::test]
async fn test_background_service() {
    let service = FooBackgroundService;
    let rx = service.start().await.unwrap();
    let result = rx.await.unwrap();
    assert!(result.is_ok());
}
```

---

## 16. Cargo.toml Dependencies

### Minimal blueprint (hello-tangle pattern)

```toml
[dependencies]
blueprint-sdk = { version = "0.1.0-alpha.22", features = ["std", "tangle", "macros"] }

[dev-dependencies]
blueprint-sdk = { version = "0.1.0-alpha.22", features = ["testing", "tangle"] }
blueprint-anvil-testing-utils = { version = "0.1.0-alpha.21" }
```

### With aggregation support

```toml
[dependencies]
blueprint-sdk = { version = "0.1.0-alpha.22", features = ["std", "tangle", "tangle-aggregation", "macros"] }

[dev-dependencies]
blueprint-anvil-testing-utils = { version = "0.1.0-alpha.21", features = ["aggregation"] }
blueprint-tangle-extra = { version = "0.1.1", features = ["aggregation"] }
```

### Key SDK feature flags

| Feature | Enables |
|---------|---------|
| `tangle` | TangleProducer, TangleConsumer, TangleLayer, TangleArg/TangleResult, TangleConfig |
| `tangle-aggregation` | HTTP-based BLS aggregation (AggregatingConsumer) |
| `tangle-p2p-aggregation` | P2P gossip-based aggregation |
| `macros` | `#[debug_job]`, `#[derive(KeystoreContext)]` |
| `testing` | Test utilities, chain-setup, tempfile |
| `std` | Standard library support (required for most use cases) |
| `evm` | Generic EVM polling producer |

**Source:** `crates/sdk/Cargo.toml` (lines 138-225), `examples/incredible-squaring/Cargo.toml`

---

## 17. Error Handling

### Handler return types

Handlers can return `TangleResult<T>` (always succeeds) or `Result<TangleResult<T>, E>` where `E: Into<BoxError>` (can fail):

```rust
// Always succeeds -- returns JobResult::Ok
pub async fn square(TangleArg((x,)): TangleArg<(u64,)>) -> TangleResult<u64> {
    TangleResult(x * x)
}

// Can fail -- returns JobResult::Ok or JobResult::Err
pub async fn fallible_handler(
    TangleArg((x,)): TangleArg<(u64,)>,
) -> Result<TangleResult<u64>, MyError> {
    if x == 0 {
        return Err(MyError::InvalidInput("x cannot be zero".into()));
    }
    Ok(TangleResult(x * x))
}
```

Custom errors need `Display` + `Error` + `Send` + `Sync`:

```rust
#[derive(Debug)]
enum MyError {
    InvalidInput(String),
}
impl std::fmt::Display for MyError { /* ... */ }
impl std::error::Error for MyError {}
```

**Source:** `crates/core/src/job/result/into_job_result.rs` (lines 134-145)

### How errors flow through the system

1. Handler returns `Err(e)` -> `into_job_result()` wraps it as `JobResult::Err(Error::new(e))`
2. `JobResult::Err` is sent to consumers like any other result
3. **`TangleConsumer`** submits error results on-chain (the on-chain contract records them)
4. **`AggregatingConsumer`** silently discards error results (logs at TRACE level)

### The `Void` type

Return `Void` when a handler should produce no on-chain result:

```rust
use blueprint_sdk::core::job::result::Void;

pub async fn event_watcher(/* ... */) -> Void {
    // Process event, no result to submit
    Void
}
```

`Void::into_job_result()` returns `None`, so no result is sent to consumers.

### What happens on handler panic

If a handler panics, the `tokio::spawn` JoinHandle catches it as a `JoinError`. The runner treats this as `JobCallError::JobDidntFinish` and **shuts down**. Panics are not recoverable at the runner level.

**Source:** `crates/runner/src/lib.rs` (lines 1133-1175), `crates/core/src/job/result/mod.rs`

---

## 18. AggregatingConsumer (Multi-Operator)

For blueprints requiring multiple operators to produce results (BLS-aggregated signatures), use `AggregatingConsumer` instead of `TangleConsumer`.

### When to use

- **`TangleConsumer`** -- Single operator submits result directly via `submitResult`
- **`AggregatingConsumer`** -- Multiple operators sign results, an aggregator collects signatures and submits via `submitAggregatedResult`

The job handler code is identical for both -- aggregation is controlled by the on-chain BSM's `getRequiredResultCount()` and `requiresAggregation()` hooks. The consumer handles the routing automatically.

### Wiring

```rust
use blueprint_tangle_extra::AggregatingConsumer;

// Basic -- checks on-chain config and routes automatically
let consumer = AggregatingConsumer::new(tangle_client.clone());

// With HTTP aggregation service (feature = "aggregation")
let consumer = AggregatingConsumer::new(tangle_client.clone())
    .with_aggregation_service(
        "http://localhost:8080",  // aggregation service URL
        bls_secret,              // BN254 BLS secret key
        operator_index,          // operator's index in the service
    );

BlueprintRunner::builder(tangle_config, env)
    .router(router())
    .producer(tangle_producer)
    .consumer(consumer)  // AggregatingConsumer instead of TangleConsumer
    .run()
    .await?;
```

### Aggregation strategies

```rust
use blueprint_tangle_extra::strategy::{AggregationStrategy, HttpServiceConfig};

// HTTP service (operators post results to central aggregator)
AggregationStrategy::HttpService(
    HttpServiceConfig::new("http://aggregator:8080", bls_secret, operator_index)
)

// P2P gossip (operators exchange results via libp2p)
// Requires feature = "p2p-aggregation"
AggregationStrategy::P2PGossip(p2p_config)
```

### Threshold types

The BSM's `getAggregationThreshold()` returns a threshold type:
- `ThresholdType::CountBased` -- N-of-M operators must sign (default)
- `ThresholdType::StakeWeighted` -- weighted by operator stake

### Key behavior

- `JobResult::Err` is silently discarded by the aggregating consumer (logged at TRACE)
- `JobResult::Ok` is either submitted directly (if single-operator) or routed through the aggregation strategy (if multi-operator), based on on-chain config

**Source:** `crates/tangle-extra/src/aggregating_consumer.rs`, `crates/tangle-extra/src/strategy.rs`, `crates/tangle-extra/src/aggregation.rs`

---

## 19. Keeper Services (Protocol Lifecycle Automation)

The SDK provides background keeper services for protocol-level lifecycle tasks. These are infrastructure utilities, not used in example blueprints, but available for operators running protocol infrastructure.

### Available keepers

| Keeper | Purpose | Default Interval |
|--------|---------|-----------------|
| `EpochKeeper` | Polls `InflationPool.isEpochReady()`, calls `distributeEpoch()` for staking rewards | 5 min |
| `RoundKeeper` | Polls `MultiAssetDelegation.lastRoundAdvance()`, calls `advanceRound()` | 1 min |
| `StreamKeeper` | Monitors `StreamingPaymentManager.pendingDripForOperator()` | 10 min |
| `SubscriptionBillingKeeper` | Scans active subscriptions, calls `billSubscriptionBatch()` (max 50/batch) | 1 min check, 5 min rescan |

### Usage

```rust
use blueprint_tangle_extra::services::{
    BackgroundKeeper, EpochKeeper, RoundKeeper, KeeperConfig,
};

let config = KeeperConfig::new(http_rpc_endpoint, keystore)
    .with_inflation_pool(inflation_pool_address)
    .with_multi_asset_delegation(mad_address)
    .with_tangle_contract(tangle_address)
    .with_epoch_interval(Duration::from_secs(300))
    .with_round_interval(Duration::from_secs(60));

let epoch_handle = EpochKeeper::start(config.clone(), shutdown_rx.resubscribe());
let round_handle = RoundKeeper::start(config, shutdown_rx.resubscribe());
```

### BackgroundKeeper trait

```rust
pub trait BackgroundKeeper: Sized {
    const NAME: &'static str;
    fn start(config: KeeperConfig, shutdown: broadcast::Receiver<()>) -> KeeperHandle;
    fn check_and_execute(config: &KeeperConfig) -> impl Future<Output = KeeperResult<bool>> + Send;
}
```

**Source:** `crates/tangle-extra/src/services/`

---

## Quick Reference: Import Paths

| Item | Import Path |
|------|-------------|
| `Router` | `blueprint_sdk::Router` |
| `BlueprintRunner` | `blueprint_sdk::runner::BlueprintRunner` |
| `BlueprintEnvironment` | `blueprint_sdk::runner::config::BlueprintEnvironment` |
| `TangleConfig` | `blueprint_sdk::runner::tangle::config::TangleConfig` |
| `TangleProducer` | `blueprint_sdk::tangle::TangleProducer` |
| `TangleConsumer` | `blueprint_sdk::tangle::TangleConsumer` |
| `TangleLayer` | `blueprint_sdk::tangle::TangleLayer` |
| `TangleArg` | `blueprint_sdk::tangle::extract::TangleArg` |
| `TangleResult` | `blueprint_sdk::tangle::extract::TangleResult` |
| `Caller` | `blueprint_sdk::tangle::extract::Caller` |
| `CallId` | `blueprint_sdk::tangle::extract::CallId` |
| `ServiceId` | `blueprint_sdk::tangle::extract::ServiceId` |
| `BlockNumber` | `blueprint_sdk::tangle::extract::BlockNumber` |
| `Timestamp` | `blueprint_sdk::tangle::extract::Timestamp` |
| `Context` | `blueprint_sdk::extract::Context` |
| `BackgroundService` | `blueprint_sdk::runner::BackgroundService` |
| `Job` | `blueprint_sdk::Job` |
| `JobCall` | `blueprint_sdk::JobCall` |
| `JobResult` | `blueprint_sdk::JobResult` |
| `IntoJobResult` | `blueprint_sdk::IntoJobResult` |
| `FromJobCall` | `blueprint_sdk::FromJobCall` |
| `TangleClientContext` | `blueprint_sdk::contexts::tangle::TangleClientContext` |
| `debug_job` | `blueprint_sdk::macros::debug_job` |
| `sol!` | `alloy_sol_types::sol` |
| `SolValue` | `alloy_sol_types::SolValue` |
| `AggregatingConsumer` | `blueprint_tangle_extra::AggregatingConsumer` |
| `AggregationStrategy` | `blueprint_tangle_extra::strategy::AggregationStrategy` |
| `Void` | `blueprint_sdk::core::job::result::Void` |
| `BlueprintHarness` | `blueprint_anvil_testing_utils::BlueprintHarness` |

---

## Logging Targets

The SDK uses `tracing` with specific targets for each component. Set `RUST_LOG` to control verbosity:

| Target | Component |
|--------|-----------|
| `tangle-producer` | TangleProducer event polling |
| `tangle-consumer` | TangleConsumer result submission |
| `blueprint-runner` | BlueprintRunner lifecycle |
| `blueprint-router` | Router dispatch decisions |
| `blueprint-rejection` | Job call failures |

Example: `RUST_LOG=tangle-consumer=trace,blueprint-router=debug cargo run`
