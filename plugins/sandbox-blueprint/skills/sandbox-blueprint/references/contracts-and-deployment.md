# Contracts and deployment

## Service-manager contract

Extend the current Blueprint Service Manager base and override only required
hooks. Model mode flags, operator capacity/admission, service-to-sandbox
assignment, pricing, and lifecycle events. Deploy separate configured contract
instances for materially different cloud/instance/TEE modes when their trust or
capacity rules differ.

Contract tests must cover service request/approval, operator eligibility,
capacity exhaustion, job pricing, unauthorized mutation, cancellation, and
assignment cleanup.

## Instance startup

The service binary should initialize in dependency order:

1. logging and production config validation;
2. optional TEE/QoS clients;
3. blueprint environment and chain client;
4. Blueprint Manager/service bridge;
5. durable store and restart reconciliation;
6. authenticated operator API;
7. reaper, cleanup, session cleanup, and metrics tasks;
8. job router, producer, and consumer.

Shutdown should stop intake, drain in-flight work, flush state/metrics, and then
terminate background tasks.

## Production deployment

Run the Blueprint Manager daemon on each operator host. The manager watches the
chain and starts the per-service instance after the operator registers, a user
requests service, and operators approve. Do not configure systemd to hand-run
an instance binary with a hard-coded service ID.

Representative manager command:

```bash
cargo-tangle blueprint run \
  --protocol tangle --network "$NETWORK" \
  --http-rpc-url "$HTTP_RPC" --ws-rpc-url "$WS_RPC" \
  --keystore-path "$KEYSTORE" --data-dir "$DATA/bpm-data" \
  --settings-file "$SETTINGS_FILE"
```

Prove deployment with manager logs plus chain IDs for blueprint, request,
service, and jobs. A locally hand-run binary is development evidence only.

Pin sidecar images by immutable version/digest in production; never rely on a
mutable `latest` tag. Keep standalone bypass flags disabled outside explicit
local tests.
