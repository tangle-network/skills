# Security and operations

## Contents

- Session and scope auth
- Secret and TEE handling
- Operator API
- Persistence and reconciliation
- Cleanup, circuit breaking, and metrics

## Session and scope auth

Use a short-lived EIP-191 challenge to prove wallet control, then issue a
self-contained encrypted session token. Bind every token to the service owner
and sandbox/instance scope. A token for one instance must fail against another.

Require a stable `SESSION_AUTH_SECRET` in production. Development-only random
keys invalidate sessions on restart and must never be accepted by production
configuration validation.

Keep the sidecar bearer token distinct from the user session token. Compare
secrets in constant time and redact them from logs, metrics, progress, and job
outputs.

## Secret and TEE handling

Use two phases:

1. create on chain with non-sensitive base configuration;
2. inject user secrets through the authenticated operator API or encrypt them
   to an attested TEE key.

Preserve sandbox identity while replacing/restarting compute. Encrypt persisted
secret material with a key derived from the production secret. Zero temporary
plaintext and avoid shell heredocs for untrusted file content.

Model TEE backends behind one contract for deploy, attest, stop, and destroy.
Validate attestation policy before accepting secrets. Unsupported sealed-secret
or attestation requirements fail closed.

## Operator API

Run Axum beside the service instance with:

1. request/correlation ID;
2. security headers and body limits;
3. endpoint-specific rate limits;
4. wallet/session extraction;
5. owner/service/instance authorization;
6. typed error mapping and audit logging.

Keep route names and payloads in the current runtime router. Do not duplicate an
endpoint table in the skill; contract-test the public router used by the SDK.

## Persistence and reconciliation

Use atomic durable writes and lock-safe concurrent access. A file-backed store
is acceptable for a single operator only when crash consistency, backups, and
disk ownership are explicit. Multi-process or replicated operators need a
shared transactional store.

Reconcile on startup before accepting new mutations. Detect missing compute,
orphaned compute, stale sidecar URLs, incomplete provisioning, and snapshot
state that cannot be restored.

## Cleanup, circuit breaking, and metrics

The reaper enforces idle and maximum-lifetime policy for running sandboxes. The
cleanup loop demotes or deletes stopped resources according to configured
retention. Never delete user-owned object storage.

Use a per-sandbox closed/open/half-open circuit breaker with one half-open probe
and bounded stale-entry cleanup. Do not share one breaker across unrelated
sandboxes.

Track jobs, duration, failures, token use, active/peak sandboxes, allocated
resources, admission rejection, cleanup transitions, snapshots, and sidecar
health. Metrics must not contain secrets or tenant content.
