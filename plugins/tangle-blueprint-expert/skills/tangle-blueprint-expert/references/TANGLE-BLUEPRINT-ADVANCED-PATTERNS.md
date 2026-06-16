# Tangle Blueprint Advanced Patterns

Patterns for GPU provisioning, shielded payments integration, pricing/RFQ, and remote infrastructure providers. These extend the base blueprint with production capabilities for compute-intensive and privacy-preserving services.

**Source:** `vllm-inference-blueprint/`, `shielded-payment-gateway/`, `blueprint-remote-providers/`

---

## Table of Contents

1. [GPU Detection and Provisioning](#1-gpu-detection-and-provisioning)
2. [Shielded Payments Integration](#2-shielded-payments-integration)
3. [Pricing TOML and RFQ](#3-pricing-toml-and-rfq)
4. [Payment Model Guide](#4-payment-model-guide)
5. [Remote Providers (Cloud GPU)](#5-remote-providers-cloud-gpu)
6. [Subprocess Lifecycle (vLLM, Ollama)](#6-subprocess-lifecycle-vllm-ollama)
7. [Dual Payment Modes](#7-dual-payment-modes)

---

## 1. GPU Detection and Provisioning

### GPU detection at startup

The operator binary detects GPUs during pre-flight (non-fatal — falls back to CPU mode):

```rust
// operator/src/health.rs

pub struct GpuInfo {
    pub name: String,
    pub memory_total_mib: u64,
    pub memory_used_mib: u64,
    pub utilization_pct: u8,
}

pub async fn detect_gpus() -> anyhow::Result<Vec<GpuInfo>> {
    // Try nvidia-smi first
    if let Ok(output) = tokio::process::Command::new("nvidia-smi")
        .args(["--query-gpu=name,memory.total,memory.used,utilization.gpu",
               "--format=csv,noheader,nounits"])
        .output().await
    {
        if output.status.success() {
            return parse_nvidia_csv(&String::from_utf8_lossy(&output.stdout));
        }
    }

    // Fallback: rocm-smi for AMD
    if let Ok(output) = tokio::process::Command::new("rocm-smi")
        .args(["--showproductname", "--showmeminfo", "vram", "--csv"])
        .output().await
    {
        if output.status.success() {
            return parse_rocm_csv(&String::from_utf8_lossy(&output.stdout));
        }
    }

    Err(anyhow::anyhow!("no GPU runtime detected"))
}
```

### BSM GPU validation at registration

The BSM contract validates GPU capabilities when an operator registers:

```solidity
contract InferenceBSM is BlueprintServiceManagerBase {
    struct GpuRequirements {
        uint32 minVramGb;
        uint32 minGpuCount;
    }

    GpuRequirements public gpuRequirements;

    function onRegister(
        bytes calldata registrationInputs,
        address operator
    ) public payable override onlyRootChain {
        // Decode operator-provided GPU info
        (uint32 vramGb, uint32 gpuCount, bytes32 gpuInfoHash) =
            abi.decode(registrationInputs, (uint32, uint32, bytes32));

        require(vramGb >= gpuRequirements.minVramGb, "insufficient VRAM");
        require(gpuCount >= gpuRequirements.minGpuCount, "insufficient GPUs");

        // Store for service matching
        operatorGpuInfo[operator] = GpuCapability(vramGb, gpuCount, gpuInfoHash);
    }
}
```

### GPU health endpoint

```rust
// In the Axum HTTP server:
async fn gpu_health(State(state): State<AppState>) -> Json<GpuHealthResponse> {
    match health::detect_gpus().await {
        Ok(gpus) => Json(GpuHealthResponse {
            available: true,
            gpus,
            model: state.config.vllm.model.clone(),
        }),
        Err(e) => Json(GpuHealthResponse {
            available: false,
            gpus: vec![],
            model: state.config.vllm.model.clone(),
        }),
    }
}
```

---

## 2. Shielded Payments Integration

Blueprints can accept privacy-preserving payments via two modes:

### Credit Mode (prepaid, account-based)

Users deposit into `ShieldedCredits` contract, then authorize spends per-request via EIP-712 signatures.

```rust
// operator/src/billing.rs — verifying a SpendAuth

pub struct SpendAuth {
    pub user: Address,
    pub operator: Address,
    pub token: Address,
    pub amount: U256,
    pub nonce: U256,
    pub expiry: U256,
    pub signature: Bytes,
}

impl BillingClient {
    pub async fn verify_credit_auth(&self, auth: &SpendAuth) -> anyhow::Result<bool> {
        // 1. Verify EIP-712 signature
        let domain = eip712_domain("ShieldedCredits", self.credits_address);
        let recovered = recover_typed_data_signer(&domain, auth)?;
        if recovered != auth.user { return Ok(false); }

        // 2. Verify on-chain: nonce not used, balance sufficient
        let (balance, current_nonce) = self.credits_contract
            .getBalance(auth.user, auth.operator, auth.token)
            .call().await?;
        if auth.nonce != current_nonce { return Ok(false); }
        if auth.amount > balance { return Ok(false); }

        Ok(true)
    }

    pub async fn execute_credit_spend(&self, auth: &SpendAuth) -> anyhow::Result<()> {
        self.credits_contract
            .spend(auth.user, auth.token, auth.amount, auth.nonce, auth.expiry, &auth.signature)
            .send().await?
            .watch().await?;
        Ok(())
    }
}
```

### RLN Mode (per-request, unlinkable)

Users submit ZK proofs with each request. Operator verifies off-chain and batch-settles on-chain.

```rust
// operator/src/billing.rs — RLN proof verification

pub struct RLNProof {
    pub nullifier: [u8; 32],
    pub share_x: U256,
    pub share_y: U256,
    pub merkle_root: [u8; 32],
    pub proof: Vec<u8>,           // Groth16 proof bytes
    pub public_signals: Vec<U256>,
}

impl BillingClient {
    pub fn verify_rln_proof(&self, proof: &RLNProof) -> anyhow::Result<bool> {
        // 1. Check nullifier not already used (local cache + on-chain)
        if self.used_nullifiers.contains(&proof.nullifier) {
            return Ok(false);
        }

        // 2. Verify Groth16 proof off-chain (ark-groth16 or snarkjs)
        let valid = groth16_verify(&self.vkey, &proof.proof, &proof.public_signals)?;

        // 3. If valid, cache nullifier for batch settlement
        if valid {
            self.pending_nullifiers.push(proof.nullifier);
            self.pending_amounts.push(request_cost);
        }

        Ok(valid)
    }

    pub async fn batch_settle(&self) -> anyhow::Result<()> {
        // Periodically submit accumulated nullifiers to RLNSettlement
        let nullifiers = self.drain_pending_nullifiers();
        let amounts = self.drain_pending_amounts();

        self.rln_contract
            .batchClaim(self.token, &nullifiers, &amounts, self.operator_address)
            .send().await?
            .watch().await?;

        Ok(())
    }
}
```

### HTTP endpoint with dual payment

```rust
// operator/src/server.rs

async fn chat_completions(
    State(state): State<AppState>,
    Json(req): Json<ChatCompletionRequest>,
) -> Result<Json<ChatCompletionResponse>, StatusCode> {
    // Check payment method
    let payment_verified = if let Some(auth) = &req.spend_auth {
        // Credit Mode: EIP-712 spend authorization
        state.billing.verify_credit_auth(auth).await
            .map_err(|_| StatusCode::PAYMENT_REQUIRED)?
    } else if let Some(rln) = &req.rln_proof {
        // RLN Mode: ZK proof per request
        state.billing.verify_rln_proof(rln)
            .map_err(|_| StatusCode::PAYMENT_REQUIRED)?
    } else if let Some(x402) = req.headers.get("X-Payment") {
        // x402: HTTP payment protocol
        true
    } else {
        return Err(StatusCode::PAYMENT_REQUIRED);
    };

    if !payment_verified {
        return Err(StatusCode::PAYMENT_REQUIRED);
    }

    // Forward to vLLM and return response
    let response = state.vllm.chat_completions(&req).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Post-request: execute spend / accumulate for batch
    if let Some(auth) = &req.spend_auth {
        state.billing.execute_credit_spend(auth).await.ok();
    }

    Ok(Json(response))
}
```

---

## 3. Pricing TOML and RFQ

Blueprints that support RFQ (Request for Quote) define pricing in TOML. The SDK reads this to generate quotes for service requests.

### Pricing config format

```toml
# config/pricing.toml

[blueprint]
name = "vllm-inference"

[resources.gpu]
type = "A100"           # or "H100", "4090", etc.
count = 1
vram_gb = 80

[pricing.subscription]
base_rate_per_month = "100000000000000000000"  # 100 tokens/month

[pricing.per_request]
input_token_price = "1000000000000"    # per input token (wei)
output_token_price = "3000000000000"   # per output token (wei)

[pricing.models.llama-3-1-70b]
min_vram_gb = 40
context_length = 8192
input_multiplier = 1.0
output_multiplier = 1.0

[pricing.models.llama-3-1-8b]
min_vram_gb = 8
context_length = 4096
input_multiplier = 0.3
output_multiplier = 0.3

[pricing.models.qwen2-0-5b]
min_vram_gb = 2
context_length = 2048
input_multiplier = 0.1
output_multiplier = 0.1
```

### Reading pricing in operator

```rust
#[derive(Debug, Clone, Deserialize)]
pub struct PricingConfig {
    pub blueprint: BlueprintMeta,
    pub resources: ResourceConfig,
    pub pricing: PricingTiers,
}

#[derive(Debug, Clone, Deserialize)]
pub struct PricingTiers {
    pub subscription: Option<SubscriptionPricing>,
    pub per_request: Option<PerRequestPricing>,
    pub models: HashMap<String, ModelPricing>,
}

impl PricingConfig {
    pub fn cost_for_request(&self, model: &str, input_tokens: u32, output_tokens: u32) -> U256 {
        let model_config = self.pricing.models.get(model)
            .unwrap_or_else(|| self.pricing.models.values().next().unwrap());

        let base = &self.pricing.per_request.as_ref().unwrap();
        let input_cost = U256::from(input_tokens)
            * base.input_token_price
            * U256::from((model_config.input_multiplier * 1000.0) as u64)
            / U256::from(1000);
        let output_cost = U256::from(output_tokens)
            * base.output_token_price
            * U256::from((model_config.output_multiplier * 1000.0) as u64)
            / U256::from(1000);

        input_cost + output_cost
    }
}
```

### RFQ flow

1. Customer calls `requestQuote(blueprintId, config)` on-chain
2. Operators read the request, compute price from `pricing.toml` + model config
3. Operator submits quote via `submitQuote(requestId, price, ttl)`
4. Customer accepts best quote → service created

---

## 4. Payment Model Guide

### Payment tokens
Blueprints accept a configurable ERC20 payment token set at BSM initialization.
In practice this is typically a stablecoin (USDC, USDT) or a wrapped stablecoin
from the VAnchor shielded pool. Do NOT hardcode "tsUSD" — use `paymentToken` in
contracts and "payment token base units" in config comments.

### Three payment paths (all blueprints should support)

1. **Direct on-chain payment** — customer calls `createService()` with ERC20 transfer.
   Standard, no privacy. The payment token must match the BSM's `paymentToken`.

2. **ShieldedCredits (x402/SpendAuth)** — customer deposits the payment token into the
   ShieldedCredits escrow contract, then signs per-request SpendAuth signatures.
   Anonymous. The operator claims payment from the escrow after serving.

3. **API key (off-chain)** — operator issues API keys and bills however they want
   (Stripe, invoice, etc.). No on-chain payment per request. Optional.

### Stateless vs stateful pricing

**Stateless services** (inference, image gen, transcription):
- Use **EventDriven** pricing model
- Bill per request via SpendAuth
- Cost models: PerToken, PerChar, PerSecond, PerImage, FlatRequest

**Stateful services** (vector store, file storage, databases):
- Use **Subscription + EventDriven** hybrid
- Subscription covers base capacity (storage allocation, included queries)
- EventDriven covers usage overage (extra queries/writes beyond subscription)
- Must track quotas: included requests per billing period, storage limits
- Storage pricing: per-GB-month (subscription component)
- Usage pricing: per-1K-operations (event-driven component)

### Pricing configuration pattern

```toml
# Stateless blueprint (e.g. inference)
[billing]
price_per_input_token = 1       # payment token base units per input token
price_per_output_token = 3      # payment token base units per output token

# Stateful blueprint (e.g. vector store)
[billing]
subscription_rate_per_month = 10000000  # 10 USDC/month (6 decimals)
included_queries_per_month = 100000     # included in subscription
price_per_k_queries_overage = 5000      # overage pricing
price_per_k_upserts = 10000
max_storage_gb = 10
```

### BSM contract pattern for payment token

```solidity
// CORRECT: generic payment token
address public paymentToken;

function initialize(address _paymentToken) external initializer {
    paymentToken = _paymentToken;
}

// WRONG: hardcoded tsUSD
address public tsUSD;  // ← don't do this
```

### Compute-time pricing pattern (video/avatar)

```toml
# Price by compute time, not output duration
[video]
price_per_compute_second = 1000  # payment token base units per second of GPU compute
max_compute_seconds = 600        # cap at 10 minutes of compute per job
```

### Long-running job pricing pattern (training)

```toml
[training]
price_per_gpu_hour = 1000000     # payment token base units per GPU-hour
max_gpu_hours = 24               # cap at 24 hours per training job
checkpoint_interval_minutes = 30  # checkpoint frequency for partial billing
```

### Subscription + overage pattern (vector store, storage)

```toml
[storage]
tiers = [
    { name = "starter", storage_gb = 1, included_queries = 100000, rate = 100000 },
    { name = "growth", storage_gb = 10, included_queries = 1000000, rate = 750000 },
]
overage_price_per_k_queries = 5000
overage_price_per_k_upserts = 10000
```

### Pricing anti-patterns (from production audit)

**Anti-pattern 1: Billing not wired**
Every handler that serves a customer request MUST go through `billing_gate` or equivalent auth check. Found in: training-blueprint (zero billing on any endpoint), vector-store (5/7 endpoints unbilled before fix). Even admin/status endpoints need at minimum a MIN_ADMIN_COST gate to prevent unauthenticated access.

**Anti-pattern 2: Pricing by output unit instead of compute cost**
Video generation and avatar generation priced per output-second (e.g. $0.50 per second of video). But a 10-second video requires 300 seconds of GPU compute. The operator loses money on every request. Price by compute-second (wall-clock time from request to completion) or per-job with a compute-time estimate.

Rule: if the service is GPU-bound and the output size doesn't correlate with compute time, price by compute time.

**Anti-pattern 3: Stateful service with EventDriven-only pricing**
Training and vector storage are stateful — the operator holds resources (GPU hours, disk space) over time. EventDriven pricing (pay per request) doesn't cover the ongoing cost. Must use Subscription + EventDriven hybrid:
- Subscription covers the base resource reservation (GPU-hours, storage GB)
- EventDriven covers per-request usage on top

**Anti-pattern 4: Multi-operator payment split not implemented**
Distributed inference has head + intermediate + tail operators. Only the head collects payment. The on-chain BSM contract is supposed to split proportionally, but the operator code doesn't trigger the split. If multiple operators serve a request, all operators must be compensated.

### Pricing checklist (use for every new blueprint)

Before shipping any blueprint, verify:

- [ ] Every HTTP handler goes through `billing_gate` or auth check
- [ ] Status/admin endpoints have at minimum `MIN_ADMIN_COST` billing gate
- [ ] Pricing unit matches operator cost structure:
  - Stateless inference (LLM, TTS, STT, embedding): per-token, per-character, per-second of INPUT
  - Image generation: per-image
  - Video/avatar generation: per-COMPUTE-second (not output duration)
  - Training: per-GPU-hour (Subscription model)
  - Storage: per-GB-month (Subscription) + per-request (EventDriven overage)
- [ ] Long-running jobs (training, video gen) estimate cost upfront and settle on actual after completion
- [ ] Config comments say "payment token base units" not "tsUSD"
- [ ] BSM contract uses `paymentToken` not `tsUSD`
- [ ] Pricing is discoverable: either on-chain via BSM or HTTP via `/pricing` or `/tiers` endpoint
- [ ] Default pricing values are realistic (not 0 or placeholder)
- [ ] Multi-operator workflows have payment split logic (or document that only one operator bills)

### Pricing model selection guide

| Service type | TNT Core model | Cost model | Billing trigger |
|---|---|---|---|
| Stateless inference (LLM, embed, TTS, STT) | EventDriven | PerToken / PerChar / PerSecond | Per request via x402 SpendAuth |
| Image generation | EventDriven | PerImage | Per request |
| Video/avatar generation | EventDriven | PerComputeSecond | Per job (async, settle on completion) |
| Training | Subscription | PerGpuHour | Subscription at service creation + checkpoint events |
| Vector storage | Subscription + EventDriven | Tier-based + per-request overage | Subscription + per-request |
| Sandbox/container | Subscription | PerHour | Subscription at service creation |
| File storage | Subscription | PerGbMonth | Subscription at service creation |

---

## 5. Remote Providers (Cloud GPU)

The `blueprint-remote-providers` crate provisions cloud infrastructure for operators who don't have local GPUs.

### Resource specification

```rust
use blueprint_remote_providers::ResourceSpec;

let spec = ResourceSpec {
    cpu_count: 4,
    memory_mb: 32768,
    disk_gb: 100,
    gpu_count: 1,
    gpu_type: Some("A100".to_string()),
};
```

### AWS GPU instance mapping

| GPU Type | Instance | vRAM | Cost/hr |
|----------|----------|------|---------|
| A100     | p4d.24xlarge | 8x40GB | ~$32.77 |
| V100     | p3.2xlarge | 1x16GB | ~$3.06 |
| T4       | g4dn.xlarge | 1x16GB | ~$0.526 |
| A10G     | g5.xlarge | 1x24GB | ~$1.006 |

### Auto-provisioning pattern

```rust
use blueprint_remote_providers::{Provider, AwsProvider, ResourceSpec};

async fn provision_gpu_instance(config: &OperatorConfig) -> anyhow::Result<Instance> {
    let provider = AwsProvider::new(
        &config.aws.access_key,
        &config.aws.secret_key,
        &config.aws.region,
    )?;

    let spec = ResourceSpec {
        gpu_count: 1,
        gpu_type: Some(config.vllm.gpu_type.clone()),
        ..Default::default()
    };

    let instance = provider.provision(spec).await?;

    // Wait for SSH ready
    instance.wait_ready(Duration::from_secs(300)).await?;

    // Install vLLM on the remote instance
    instance.exec("pip install vllm").await?;
    instance.exec(&format!(
        "vllm serve {} --host 0.0.0.0 --port 8000",
        config.vllm.model
    )).await?;

    Ok(instance)
}
```

---

## 6. Subprocess Lifecycle (vLLM, Ollama)

Blueprints that manage inference engines wrap them as child processes:

```rust
// operator/src/vllm.rs

pub struct VllmProcess {
    child: tokio::process::Child,
    base_url: String,
}

impl VllmProcess {
    pub async fn spawn(config: Arc<OperatorConfig>) -> anyhow::Result<Self> {
        let mut cmd = tokio::process::Command::new("vllm");
        cmd.arg("serve")
            .arg(&config.vllm.model)
            .args(["--host", &config.vllm.host])
            .args(["--port", &config.vllm.port.to_string()])
            .args(["--gpu-memory-utilization",
                   &config.vllm.gpu_memory_utilization.to_string()])
            .kill_on_drop(true);

        let child = cmd.spawn()?;
        let base_url = format!("http://{}:{}", config.vllm.host, config.vllm.port);

        Ok(Self { child, base_url })
    }

    pub async fn wait_ready(&self) -> anyhow::Result<()> {
        let client = reqwest::Client::new();
        let url = format!("{}/health", self.base_url);

        for _ in 0..120 {
            if client.get(&url).send().await.map(|r| r.status().is_success()).unwrap_or(false) {
                return Ok(());
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }

        Err(anyhow::anyhow!("vLLM failed to become ready within 120s"))
    }
}
```

### Ollama fallback (CPU mode)

```rust
pub async fn spawn_ollama(model: &str) -> anyhow::Result<OllamaProcess> {
    // Start Ollama server
    let child = tokio::process::Command::new("ollama")
        .arg("serve")
        .kill_on_drop(true)
        .spawn()?;

    // Pull model
    tokio::process::Command::new("ollama")
        .args(["pull", model])
        .status().await?;

    Ok(OllamaProcess { child, model: model.to_string() })
}
```

---

## 7. Dual Payment Modes

### Contract architecture

```
ShieldedCredits.sol     ← Prepaid account-based (Credit Mode)
  - deposit(user, operator, token, amount)
  - spend(user, token, amount, nonce, expiry, signature)  [EIP-712]
  - reclaimExpiredAuth(user, operator, token)

RLNSettlement.sol       ← Per-request ZK (RLN Mode)
  - deposit(token, amount, identityCommitment)
  - depositWithPolicy(token, rlnAmount, policyAmount, identityCommitment)
  - batchClaim(token, nullifiers[], amounts[], operator)  [operator-only]
  - slash(nullifier, x1, y1, x2, y2, identityCommitment) [Shamir SSS]
  - burnPolicyStake(identityCommitment, amount, reason)   [policy violation]

ShieldedGateway.sol     ← Bridge to VAnchor shielded pool
  - shieldedRequestService(proof, ..., blueprintId, operators)
  - shieldedFundService(proof, ..., serviceId)
  - shieldedFundCredits(proof, ..., user, operator)
  - shieldedFundRLN(proof, ..., identityCommitment)
```

### Dual staking (RLN Mode)

Each RLN user deposits two stakes:

| Stake | Symbol | Purpose | On violation |
|-------|--------|---------|-------------|
| RLN deposit | D | Anti-double-spend (Shamir slashable) | Slashed to prover |
| Policy stake | S | Anti-abuse (operator-burnable) | Burned to 0xdEaD |

The operator can burn policy stake for ToS violations (spam, abuse) but **cannot claim it** — it goes to a dead address. This prevents operators from having a financial incentive to fabricate violations.
