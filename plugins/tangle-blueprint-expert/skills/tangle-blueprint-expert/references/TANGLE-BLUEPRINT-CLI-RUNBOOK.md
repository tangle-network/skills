# Tangle Blueprint CLI Runbook (Build -> Deploy -> Service -> Jobs -> UI)

Use this as the canonical operator/developer flow for shipping a blueprint with real CLI validation.

Read [TANGLE-BLUEPRINT-OVERVIEW.md](./TANGLE-BLUEPRINT-OVERVIEW.md) before running this flow so blueprint vs service-instance semantics stay explicit.

> **Source of truth:** Always run `cargo tangle <command> --help` for the installed version.
> This document was verified against the source at `cli/src/main.rs` and related modules.

## Scope

This runbook is for:

1. Building a new blueprint from scaffold.
2. Deploying/testing with `cargo tangle` flows.
3. Getting real IDs (`blueprint_id`, `request_id`, `service_id`).
4. Verifying runtime + job execution against non-mocked paths.
5. Optionally validating the UI layer on top.

## Blueprint Hierarchy (Must Be Explicit)

Use this model consistently in architecture docs, code, and UI copy:

1. Blueprint = abstract template/capability contract.
2. Operators register for a blueprint to advertise they can run that template.
3. Customer requests a service instance and selects a subset of registered operators.
4. Service instance = concrete deployment of that template with chosen operators + request params.
5. Jobs mutate that specific service instance state; queries read state.

A service instance can represent anything the blueprint defines: single VM, single-tenant app, multi-tenant control plane, or full cloud workflow.

---

## 0) Pin CLI + verify surface

```bash
cargo tangle --version
cargo tangle blueprint --help
```

Current validated baseline in this workspace:

- `cargo-tangle 0.4.0-alpha.23`

Top-level command groups (visible aliases in parentheses):

| Group | Alias | Description |
|---|---|---|
| `blueprint` | `bp` | Create, deploy, run, and manage blueprints |
| `key` | `k` | Generate, import, export, and list keys |
| `operator` | `op` | Register, stake, and manage services as an operator |
| `delegator` | `del` | Deposit, delegate, and withdraw stake as a delegator |

Important command shape notes for this version:

1. New blueprint scaffold command is `cargo tangle blueprint create` (not `new`).
2. Service lifecycle uses `service request/approve/reject/join/leave/spawn/list/requests/show`.
3. Job lifecycle uses `jobs list/show/submit/watch`.
4. Operator registration on the restaking layer is `cargo tangle operator register`.
5. Blueprint-specific operator registration is `cargo tangle blueprint register`.

---

## 1) Scaffold first (mandatory for net-new blueprint)

```bash
cargo tangle blueprint create \
  --name <blueprint-name> \
  --tangle \
  --skip-prompts \
  --project-description "<short description>" \
  --project-authors "<name/email>"
```

### Create flags

| Flag | Short | Required | Description |
|---|---|---|---|
| `--name` | `-n` | Yes | Project name (directory + package name) |
| `--tangle` | | No | Create a Tangle blueprint |
| `--skip-prompts` | | No | Skip interactive prompts; all required vars must be on CLI |
| `--project-description` | | Required with `--skip-prompts` | Short project description |
| `--project-authors` | | Required with `--skip-prompts` | Authors string |
| `--define` / `-d` | `-d` | No | Key=value template variable (repeatable) |
| `--template-values-file` | | No | JSON file with template values (conflicts with `--define`) |
| `--repo` / `-r` | `-r` | No | Custom template git repository |
| `--branch` / `-b` | `-b` | No | Template repo branch |
| `--tag` / `-t` | `-t` | No | Template repo tag (conflicts with `--branch`) |
| `--path` / `-p` | `-p` | No | Local template path |

Then immediately:

```bash
cd <blueprint-name>
cargo check
```

Do not hand-roll initial workspace layout when `create` is available.

---

## 2) Required config contract: `settings.env`

The CLI currently loads Tangle protocol settings from `settings.env` and expects:

```env
BLUEPRINT_ID=<u64>
SERVICE_ID=<u64 or omit>
TANGLE_CONTRACT=<0x...>
RESTAKING_CONTRACT=<0x...>
STATUS_REGISTRY_CONTRACT=<0x...>
```

If missing, commands fail early with errors like `Missing BLUEPRINT_ID`.

### Local seeded harness values (deterministic devnet smoke)

For seeded local harness/testing flows, use:

```env
BLUEPRINT_ID=0
SERVICE_ID=0
TANGLE_CONTRACT=0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9
RESTAKING_CONTRACT=0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
STATUS_REGISTRY_CONTRACT=0x8f86403A4DE0bb5791fa46B8e795C547942fE4Cf
```

---

## 3) Build + test baseline

```bash
cargo check
cargo test --all
```

If the repo includes UI:

```bash
cd ui
pnpm install
pnpm build
pnpm test   # or the repo's equivalent test command
```

If operator API serves embedded UI assets, add a reproducible sync/build command (for example `build:embedded`) and verify asset routes (`/assets/*`) resolve.

---

## 4) Key management

### 4.1 Generate a key

```bash
cargo tangle key generate \
  -t ecdsa \
  -o ./keystore
```

| Flag | Short | Required | Description |
|---|---|---|---|
| `--key-type` | `-t` | Yes | Key algorithm: `ecdsa` or `bn254` |
| `--output` | `-o` | No | Keystore directory path. If omitted, prints to stdout |
| `--show-secret` | `-v` | No | Display the secret key in output (use with caution) |
| `--seed` | | No | Seed bytes for deterministic key generation |

### 4.2 Import a key

```bash
cargo tangle key import \
  -t ecdsa \
  -x <hex-secret> \
  -k ./keystore \
  -p tangle
```

| Flag | Short | Required | Description |
|---|---|---|---|
| `--key-type` | `-t` | No | Key type (auto-detected if omitted): `ecdsa` or `bn254` |
| `--secret` | `-x` | No | Hex-encoded secret key (without 0x prefix) |
| `--keystore-path` | `-k` | Yes | Path to keystore directory |
| `--protocol` | `-p` | No | Target protocol (default: `tangle`) |

### 4.3 Export a key

```bash
cargo tangle key export \
  -t ecdsa \
  -p <public-key-hex> \
  -k ./keystore
```

| Flag | Short | Required | Description |
|---|---|---|---|
| `--key-type` | `-t` | Yes | Key type: `ecdsa` or `bn254` |
| `--public` | `-p` | Yes | Public key hex to look up |
| `--keystore-path` | `-k` | Yes | Path to keystore directory |

### 4.4 List keys

```bash
cargo tangle key list -k ./keystore
```

| Flag | Short | Required | Description |
|---|---|---|---|
| `--keystore-path` | `-k` | Yes | Path to keystore directory |

### 4.5 Generate mnemonic

```bash
cargo tangle key generate-mnemonic -w 24
```

| Flag | Short | Required | Description |
|---|---|---|---|
| `--word-count` | `-w` | No | Number of words: 12, 15, 18, 21, or 24 (default: 12) |

---

## 5) Deployment flows

### 5.1 Local devnet smoke (production-path sanity, local chain)

```bash
cargo tangle blueprint deploy tangle \
  --network devnet \
  --settings-file ./settings.env \
  --spawn-method native \
  --exit-after-seconds 20
```

Expected completion line:

```text
Deployment complete -> network=devnet blueprint=<id> service=<id>
```

Notes:

1. This path validates manager/runtime orchestration on local devnet.
2. It can still fail on runtime artifact/source resolution if your local environment cannot fetch the configured source.

### 5.2 Testnet/mainnet definition deployment (real blueprint registration)

```bash
cargo tangle blueprint deploy tangle \
  --network testnet \
  --settings-file ./settings.env \
  --definition ./dist/definition.json
```

Capture blueprint ID:

```bash
BLUEPRINT_ID=$(
  cargo tangle blueprint deploy tangle --network testnet --settings-file ./settings.env --definition ./dist/definition.json \
  | sed -nE 's/.*blueprint=([0-9]+).*/\1/p' | tail -1
)
echo "$BLUEPRINT_ID"
```

### Deploy tangle -- full flag reference

| Flag | Required | Default | Description |
|---|---|---|---|
| `--network` | No | `devnet` | Target: `devnet`, `testnet`, or `mainnet` |
| `--settings-file` | No | `./settings.env` | Path to Tangle EVM settings file |
| `--definition` | Testnet/mainnet only | | Blueprint definition file (JSON/YAML/TOML) |
| `--spawn-method` | No | `vm` | Runtime: `vm`, `native`, or `container` |
| `--exit-after-seconds` | No | | Auto-shutdown devnet after N seconds |
| `--include-anvil-logs` | No | false | Stream Anvil stdout/stderr |
| `--allow-unchecked-attestations` | No | false | Skip attestation checks (testing only) |
| `--artifact-source` | No | | Override native source: `github`, `http`, or `ipfs` |
| `--artifact-entrypoint` | No | | Entrypoint for overridden native source |
| `--artifact-binary` | No | | Binary descriptor: `NAME:ARCH:OS:SHA256[:BLAKE3]` (repeatable) |
| `--github-owner` | No | | GitHub release owner (required with `--artifact-source github`) |
| `--github-repo` | No | | GitHub release repo |
| `--github-tag` | No | | GitHub release tag |
| `--remote-dist-url` | No | | Distribution manifest URL (required with http/ipfs source) |
| `--remote-archive-url` | No | | Archive URL (required with http/ipfs source) |
| `--http-rpc-url` | No | From env/settings | Override HTTP RPC endpoint (non-devnet) |
| `--ws-rpc-url` | No | From env/settings | Override WebSocket RPC endpoint (non-devnet) |
| `--keystore-path` | No | From env or `./keystore` | Override keystore path (non-devnet) |
| `--tangle-contract` | No | From settings | Override Tangle contract address |
| `--restaking-contract` | No | From settings | Override restaking contract address |
| `--status-registry-contract` | No | From settings | Override status registry contract address |

---

## 6) Operator setup + blueprint registration

### 6.1 Register operator on restaking layer

This is `cargo tangle operator register` -- it stakes the initial bond and enables operator status on the restaking contract.

```bash
cargo tangle operator register \
  --http-rpc-url <http-rpc> \
  --ws-rpc-url <ws-rpc> \
  --keystore-path ./keystore \
  --tangle-contract <tangle-address> \
  --restaking-contract <restaking-address> \
  --amount <stake-wei> \
  --json
```

| Flag | Required | Default | Description |
|---|---|---|---|
| `--http-rpc-url` | No | `http://127.0.0.1:8545` | HTTP RPC endpoint |
| `--ws-rpc-url` | No | `ws://127.0.0.1:8546` | WebSocket RPC endpoint |
| `--keystore-path` | No | `./keystore` | Keystore directory |
| `--tangle-contract` | Yes | | Tangle contract address |
| `--restaking-contract` | Yes | | Restaking contract address |
| `--status-registry-contract` | No | | Status registry contract address |
| `--amount` | Yes | | Initial stake in wei |
| `--json` | No | false | JSON output |

Note: For ERC20 bond tokens, you must call `cargo tangle delegator approve` on the restaking contract first.

### 6.2 Register operator for a specific blueprint

This is `cargo tangle blueprint register` -- it submits operator registration to the Tangle contract for a specific blueprint ID.

Optional preregistration (generates signed registration inputs without submitting):

```bash
cargo tangle blueprint preregister \
  -p tangle \
  -k ./keystore \
  -f ./settings.env
```

Then register:

```bash
cargo tangle blueprint register \
  --http-rpc-url <http-rpc> \
  --ws-rpc-url <ws-rpc> \
  --keystore-path ./keystore \
  --tangle-contract <tangle-address> \
  --restaking-contract <restaking-address> \
  --blueprint-id <blueprint-id>
```

| Flag | Required | Default | Description |
|---|---|---|---|
| `--http-rpc-url` | No | `http://127.0.0.1:8545` | HTTP RPC endpoint |
| `--ws-rpc-url` | No | `ws://127.0.0.1:8546` | WebSocket RPC endpoint |
| `--keystore-path` | No | `./keystore` | Keystore directory |
| `--tangle-contract` | Yes | | Tangle contract address |
| `--restaking-contract` | Yes | | Restaking contract address |
| `--status-registry-contract` | No | | Status registry contract address |
| `--blueprint-id` | Yes | | Blueprint ID to register for |
| `--rpc-endpoint` | No | | RPC override (uses network default if omitted) |
| `--registration-inputs` | No | | JSON file with pre-signed inputs from `preregister` |

---

## 7) Service lifecycle (how to get request/service IDs)

### 7.1 Request service

```bash
cargo tangle blueprint service request \
  --http-rpc-url <http-rpc> \
  --ws-rpc-url <ws-rpc> \
  --keystore-path ./keystore \
  --tangle-contract <tangle-address> \
  --restaking-contract <restaking-address> \
  --blueprint-id <blueprint-id> \
  --operator <operator-address> \
  --ttl 600 \
  --json
```

| Flag | Required | Default | Description |
|---|---|---|---|
| `--blueprint-id` | Yes | | Blueprint ID to instantiate |
| `--operator` | Yes | | Operator address (repeatable for multiple operators) |
| `--operator-exposure-bps` | No | | Exposure per operator in basis points (10000 = 100%). Matches `--operator` order |
| `--permitted-caller` | No | | Addresses allowed to submit jobs (repeatable) |
| `--config-file` | No | | File containing service configuration (raw bytes) |
| `--config-hex` | No | | Hex-encoded service configuration |
| `--ttl` | No | **600** | Time-to-live in seconds (0 = no expiration) |
| `--payment-token` | No | `0x0000...0000` | ERC20 token for payment (0x0 = native token) |
| `--payment-amount` | No | 0 | Payment amount in wei |
| `--security-requirement` | No | | Format: `KIND:TOKEN:MIN:MAX` (repeatable). KIND: `native`/`eth` or `erc20`. MIN/MAX are in basis points (0-10000) |
| `--json` | No | false | JSON output |
| Network flags | | | `--http-rpc-url`, `--ws-rpc-url`, `--keystore-path`, `--tangle-contract`, `--restaking-contract`, `--status-registry-contract` |

Capture request ID:

```bash
REQUEST_ID=$(
  cargo tangle blueprint service request ... --json \
  | jq -r 'select(.event=="service_request_id") | .request_id' \
  | tail -1
)
echo "$REQUEST_ID"
```

### 7.2 Approve (operator side)

```bash
cargo tangle blueprint service approve \
  --http-rpc-url <http-rpc> \
  --ws-rpc-url <ws-rpc> \
  --keystore-path ./operator-keystore \
  --tangle-contract <tangle-address> \
  --restaking-contract <restaking-address> \
  --request-id <request-id> \
  --restaking-percent 50 \
  --json
```

| Flag | Required | Default | Description |
|---|---|---|---|
| `--request-id` | Yes | | Request ID to approve |
| `--restaking-percent` | No | **50** | Percentage of stake to commit (0-100) |
| `--security-commitment` | No | | Format: `KIND:TOKEN:EXPOSURE_BPS` (repeatable). KIND: `native`/`eth` or `erc20`. EXPOSURE_BPS in basis points (0-10000) |
| `--json` | No | false | JSON output |

### 7.3 Reject (operator side)

```bash
cargo tangle blueprint service reject \
  --request-id <request-id> \
  --json
```

### 7.4 Resolve active service ID

```bash
cargo tangle blueprint service list \
  --http-rpc-url <http-rpc> \
  --ws-rpc-url <ws-rpc> \
  --keystore-path ./user-keystore \
  --tangle-contract <tangle-address> \
  --restaking-contract <restaking-address> \
  --json
```

### 7.5 Show service request details

```bash
cargo tangle blueprint service show \
  --request-id <request-id> \
  [network flags]
```

### 7.6 List pending service requests

```bash
cargo tangle blueprint service requests \
  --json \
  [network flags]
```

### 7.7 Service join (dynamic services)

```bash
cargo tangle blueprint service join \
  --service-id <service-id> \
  --exposure-bps 10000 \
  --json \
  [network flags]
```

| Flag | Required | Default | Description |
|---|---|---|---|
| `--service-id` | Yes | | Service ID to join |
| `--exposure-bps` | No | 10000 (100%) | Stake exposure in basis points |
| `--commitment` | No | | Asset commitment: `KIND:TOKEN:EXPOSURE_BPS` (repeatable). KIND: `native`/`eth` or `erc20` |
| `--json` | No | false | JSON output |

### 7.8 Service leave

```bash
cargo tangle blueprint service leave \
  --service-id <service-id> \
  --json \
  [network flags]
```

### 7.9 Service spawn (local runtime for testing)

```bash
cargo tangle blueprint service spawn \
  --blueprint-id <blueprint-id> \
  --service-id <service-id> \
  --spawn-method native \
  [network flags]
```

| Flag | Required | Default | Description |
|---|---|---|---|
| `--blueprint-id` | Yes | | Blueprint ID defining the service logic |
| `--service-id` | Yes | | Service ID to spawn runtime for |
| `--spawn-method` | No | `vm` | Runtime execution mode: `vm`, `native`, or `container` |
| `--data-dir` | No | | Directory for blueprint data |
| `--allow-unchecked-attestations` | No | false | Testing only |
| `--dry-run` | No | false | Simulate without on-chain transactions |
| `--preferred-source` | No | | Override source: `native`, `container`, or `wasm` |
| `--vm` | No | | Force VM sandbox execution |
| `--no-vm` | No | | Disable VM sandbox |

### Tenancy Decision at Service-Request Time

Before finalizing request parameters, decide and document:

1. `single-tenant` instance:
   - one customer trust boundary per service instance
   - provisioning/auth/secrets scoped to that service
2. `multi-tenant` instance:
   - one service instance hosts multiple customer tenants
   - additional tenant identity and isolation controls required inside service logic

Operator selection is always per service request, even when blueprint logic is shared.

---

## 8) Run the blueprint operator runtime

```bash
cargo tangle blueprint run \
  --protocol tangle \
  --http-rpc-url <http-rpc> \
  --ws-rpc-url <ws-rpc> \
  --keystore-path ./keystore \
  --settings-file ./settings.env \
  --spawn-method vm
```

Use `--spawn-method native` for faster local debug.

### Run -- full flag reference

| Flag | Short | Required | Default | Description |
|---|---|---|---|---|
| `--protocol` | `-p` | No | `tangle` | Target protocol |
| `--http-rpc-url` | | No | `http://127.0.0.1:8545` | HTTP RPC endpoint |
| `--ws-rpc-url` | | No | `ws://127.0.0.1:8546` | WebSocket RPC endpoint |
| `--keystore-path` | `-k` | No | `./keystore` | Keystore directory |
| `--network` | `-w` | No | `local` | Network name: `local`, `testnet`, or `mainnet` |
| `--data-dir` | `-d` | No | (none) | Directory for blueprint data and state |
| `--bootnodes` | `-n` | No | | P2P bootstrap nodes (repeatable) |
| `--settings-file` | `-f` | No | `./settings.env` | Settings file path |
| `--allow-unchecked-attestations` | | No | false | Skip attestation checks (env: `ALLOW_UNCHECKED_ATTESTATIONS`) |
| `--spawn-method` | | No | `vm` | Runtime: `vm`, `native`, or `container` |
| `--preferred-source` | | No | | Override source type: `native`, `container`, or `wasm` |
| `--vm` | | No | | Force VM sandbox execution |
| `--no-vm` | | No | | Disable VM sandbox (use native execution) |
| `--save-runtime-prefs` | | No | | Save runtime preferences to settings file |

---

## 9) Blueprint list + debug

### 9.1 List blueprints, requests, services

```bash
cargo tangle blueprint list blueprints [network flags]
cargo tangle blueprint list requests  [network flags]
cargo tangle blueprint list services  [network flags]
```

All three accept the shared `TangleClientArgs` network flags (`--http-rpc-url`, `--ws-rpc-url`, `--keystore-path`, `--tangle-contract`, `--restaking-contract`, `--status-registry-contract`).

### 9.2 Debug spawn

Launch a local Anvil stack and run the blueprint against it.

```bash
cargo tangle blueprint debug spawn \
  --settings-file ./settings.env \
  --spawn-method native \
  --include-anvil-logs
```

| Flag | Required | Default | Description |
|---|---|---|---|
| `--settings-file` | No | `./settings.env` | Settings file |
| `--include-anvil-logs` | No | false | Stream Anvil output |
| `--allow-unchecked-attestations` | No | false | Testing only |
| `--spawn-method` | No | `vm` | Runtime mode |

---

## 10) Jobs: schema -> submit -> watch

### 10.1 List jobs for a blueprint

```bash
cargo tangle blueprint jobs list \
  --blueprint-id <blueprint-id> \
  --json \
  [network flags]
```

### 10.2 Show details for a submitted job call

```bash
cargo tangle blueprint jobs show \
  --blueprint-id <blueprint-id> \
  --service-id <service-id> \
  --call-id <call-id> \
  --json \
  [network flags]
```

### 10.3 Submit job and wait for result

```bash
cargo tangle blueprint jobs submit \
  --blueprint-id <blueprint-id> \
  --service-id <service-id> \
  --job <job-index> \
  --params-file ./job-input.json \
  --watch \
  --timeout-secs 60 \
  --json \
  [network flags]
```

#### Input methods (mutually exclusive -- provide exactly one)

| Flag | Description |
|---|---|
| `--payload-hex <HEX>` | Raw hex-encoded bytes (without 0x prefix) |
| `--payload-file <FILE>` | File containing raw job input bytes |
| `--params-file <FILE>` | JSON file with structured inputs matching the on-chain job schema |
| `--prompt` | Interactively prompt for each job input |

#### Other submit flags

| Flag | Required | Default | Description |
|---|---|---|---|
| `--blueprint-id` | Yes | | Blueprint ID |
| `--service-id` | Yes | | Service ID |
| `--job` | Yes | | Job index (0-based) |
| `--watch` | No | false | Wait for job result after submission |
| `--timeout-secs` | No | **60** | Timeout in seconds when watching |
| `--json` | No | false | JSON output |

### 10.4 Watch an existing job call

If you already have a call ID:

```bash
cargo tangle blueprint jobs watch \
  --blueprint-id <blueprint-id> \
  --service-id <service-id> \
  --call-id <call-id> \
  --timeout-secs 60 \
  [network flags]
```

---

## 11) Operator subcommands (`cargo tangle operator ...`)

All operator subcommands accept the shared `TangleClientArgs` network flags.

### 11.1 Status + heartbeat

```bash
# Check operator status for a service
cargo tangle operator status \
  --blueprint-id <id> --service-id <id> [--operator <address>] [--json]

# Submit a heartbeat (alias: hb)
cargo tangle operator heartbeat \
  --blueprint-id <id> --service-id <id> [--status-code 0] [--json]
```

| Flag | Required | Default | Description |
|---|---|---|---|
| `--blueprint-id` | Yes | | Blueprint ID |
| `--service-id` | Yes | | Service ID |
| `--operator` | No | Local account | Operator address to query |
| `--status-code` | No (heartbeat only) | 0 | 0 = healthy, non-zero = error |
| `--json` | No | false | JSON output |

### 11.2 Restaking info + delegators

```bash
# Show operator stake, delegation count, status
cargo tangle operator restaking [--operator <address>] [--json]

# List delegators
cargo tangle operator delegators [--operator <address>] [--json]
```

### 11.3 Service join/leave (operator-level)

```bash
cargo tangle operator join \
  --blueprint-id <id> --service-id <id> [--exposure-bps 10000] \
  [--commitment KIND:TOKEN:EXPOSURE_BPS] [--json]

cargo tangle operator leave \
  --blueprint-id <id> --service-id <id> [--json]
```

Note: `--exposure-bps` defaults to 10000 (100%). `--commitment` is repeatable. Format: `KIND:TOKEN:EXPOSURE_BPS` where KIND is `native`/`eth` or `erc20`. EXPOSURE_BPS is in basis points (0-10000).

### 11.4 Scheduled exit from a service

```bash
cargo tangle operator schedule-exit --service-id <id> [--json]
cargo tangle operator execute-exit  --service-id <id> [--json]
cargo tangle operator cancel-exit   --service-id <id> [--json]
```

After scheduling, wait for the exit queue duration (default 7 days) before executing.

### 11.5 Stake management

```bash
# Increase operator stake
cargo tangle operator increase-stake --amount <wei> [--json]

# Schedule unstake (begins unbonding period)
cargo tangle operator schedule-unstake --amount <wei> [--json]

# Execute matured unstake
cargo tangle operator execute-unstake [--json]
```

### 11.6 Operator lifecycle

```bash
# Begin leaving as operator (cannot accept new services)
cargo tangle operator start-leaving [--json]

# Complete leaving after exit period
cargo tangle operator complete-leaving [--json]
```

### 11.7 Delegation controls

```bash
# Get current delegation mode
cargo tangle operator get-delegation-mode [--operator <address>] [--json]

# Set delegation mode: disabled, whitelist, or open
cargo tangle operator set-delegation-mode --mode <MODE> [--json]

# Update delegation whitelist (add/remove addresses)
cargo tangle operator update-whitelist \
  --delegator <address> [--delegator <address2>] \
  --approved [--json]

# Check if a delegator can delegate to an operator
cargo tangle operator can-delegate \
  --operator <address> --delegator <address> [--json]
```

Delegation modes:
- `disabled` -- Only operator can self-stake (default)
- `whitelist` -- Only approved addresses can delegate
- `open` -- Anyone can delegate

---

## 12) Delegator subcommands (`cargo tangle delegator ...`)

All delegator subcommands accept the shared `TangleClientArgs` network flags.

### 12.1 Query commands

```bash
# Show all staking positions (deposits, locks, delegations, pending requests)
cargo tangle delegator positions \
  [--delegator <address>] \
  [--token 0x0000000000000000000000000000000000000000] \
  [--json]

# List active delegations
cargo tangle delegator delegations [--delegator <address>] [--json]

# List pending unstake requests
cargo tangle delegator pending-unstakes [--delegator <address>] [--json]

# List pending withdrawal requests
cargo tangle delegator pending-withdrawals [--delegator <address>] [--json]

# Check ERC20 token allowance for the restaking contract
cargo tangle delegator allowance --token <address> [--owner <address>] [--spender <address>] [--json]

# Check ERC20 balance
cargo tangle delegator balance --token <address> [--owner <address>] [--json]
```

### 12.2 Transaction commands

```bash
# Approve ERC20 tokens for restaking (required before depositing ERC20)
cargo tangle delegator approve --token <address> --amount <wei> [--spender <address>] [--json]

# Deposit tokens (use 0x0 for native token)
cargo tangle delegator deposit --amount <wei> [--token 0x0...] [--json]

# Delegate to an operator
cargo tangle delegator delegate \
  --operator <address> \
  --amount <wei> \
  [--token 0x0...] \
  [--selection all|fixed] \
  [--blueprint-id <id>] \
  [--from-deposit] \
  [--json]

# Undelegate from an operator (initiates unbonding)
cargo tangle delegator undelegate \
  --operator <address> \
  --amount <wei> \
  [--token 0x0...] \
  [--json]

# Execute all matured unstake requests
cargo tangle delegator execute-unstake [--json]

# Execute a specific unstake and withdraw in one transaction
cargo tangle delegator execute-unstake-withdraw \
  --operator <address> \
  --shares <amount> \
  --requested-round <round> \
  [--token 0x0...] \
  [--receiver <address>] \
  [--json]

# Schedule withdrawal of non-delegated deposits
cargo tangle delegator schedule-withdraw \
  --amount <wei> \
  [--token 0x0...] \
  [--json]

# Execute all matured withdrawals
cargo tangle delegator execute-withdraw [--json]
```

### Delegation selection modes

When delegating, `--selection` controls which blueprints the delegation covers:
- `all` (default) -- Delegation applies to all blueprints the operator supports
- `fixed` -- Pin delegation to specific blueprint IDs (requires `--blueprint-id`, repeatable)

---

## 13) Shared network flags (`TangleClientArgs`)

These flags appear on most subcommands that interact with the Tangle chain:

| Flag | Default | Description |
|---|---|---|
| `--http-rpc-url` | `http://127.0.0.1:8545` | HTTP RPC endpoint |
| `--ws-rpc-url` | `ws://127.0.0.1:8546` | WebSocket RPC endpoint |
| `--keystore-path` | `./keystore` | Path to keystore directory |
| `--tangle-contract` | (required) | Tangle contract address |
| `--restaking-contract` | (required) | Restaking contract address |
| `--status-registry-contract` | (optional) | Status registry contract address (defaults to 0x0 if omitted) |

---

## 14) UI + testing infrastructure integration

If your blueprint ships a UI:

1. Build and test UI in CI and local before deploy.
2. Validate UI against real operator/API endpoints, not mocked-only paths.
3. Keep shared boundaries clean:
   - provisioning/chain/job UX: `@tangle-network/blueprint-ui`
   - agent runtime UX: `@tangle-network/agent-ui` only when needed
4. Add one scripted E2E that covers:
   - service request/approval
   - at least one job submission + result
   - UI path that consumes live state from operator/API

---

## 15) Production-like validation gates (required before merge)

1. `cargo check` and relevant tests pass.
2. CLI deploy path executed (`deploy tangle` for local smoke and/or network definition deploy).
3. Real service request/approval completed.
4. Real job submission + result observed.
5. IDs captured and documented (`blueprint_id`, `request_id`, `service_id`, `call_id`).
6. UI (if present) validated against non-mocked endpoints.
7. Tenancy/auth gates validated for the selected service model:
   - single-tenant: no cross-service state bleed; service-scoped auth enforced
   - multi-tenant: tenant isolation tests and tenant-scoped auth checks pass

---

## 16) Known gotchas

1. `settings.env` is required by multiple CLI paths; missing `BLUEPRINT_ID` fails early.
2. `service activate` is not a CLI command in current surface.
3. `deploy tangle --network devnet` smoke can still fail if runtime source resolution points at unavailable container registries.
4. Some older docs/examples may reference renamed commands; always trust `cargo tangle ... --help` for the installed version.
5. `--ttl` default is **600** seconds (not 3600). Use `--ttl 0` for no expiration.
6. `--timeout-secs` for job submit/watch defaults to **60** (not 120).
7. `--restaking-percent` on service approve defaults to **50** (not 100).
8. `--spawn-method` defaults to `vm` everywhere. Use `native` for faster local iteration.
9. Operator registration on the restaking layer (`cargo tangle operator register`) is separate from blueprint-level operator registration (`cargo tangle blueprint register`). Both are needed.

---

## 17) One-file smoke script template

```bash
#!/usr/bin/env bash
set -euo pipefail

: "${HTTP_RPC_URL:?missing}"
: "${WS_RPC_URL:?missing}"
: "${TANGLE_CONTRACT:?missing}"
: "${RESTAKING_CONTRACT:?missing}"
: "${BLUEPRINT_ID:?missing}"

COMMON_FLAGS=(
  --http-rpc-url "$HTTP_RPC_URL"
  --ws-rpc-url "$WS_RPC_URL"
  --keystore-path ./user-keystore
  --tangle-contract "$TANGLE_CONTRACT"
  --restaking-contract "$RESTAKING_CONTRACT"
)

REQ_JSON=$(cargo tangle blueprint service request \
  "${COMMON_FLAGS[@]}" \
  --blueprint-id "$BLUEPRINT_ID" \
  --operator "$OPERATOR_ADDRESS" \
  --ttl 600 \
  --json)

REQUEST_ID=$(printf "%s\n" "$REQ_JSON" | jq -r 'select(.event=="service_request_id") | .request_id' | tail -1)
echo "request_id=$REQUEST_ID"
```

Extend this template with `approve`, `service list`, and `jobs submit --watch` for full E2E.
