# Edge deployment

Keep edge handlers bounded: authenticate, validate credits/policy, resolve or
schedule sandbox work, register mapping, issue a token, and return JSON. The
browser holds the gateway WebSocket.

Use platform-managed state:

- KV for short-lived session routing/cache;
- D1 or another transactional store for users, sessions, turns, and credits;
- R2/object storage for tenant-scoped uploaded artifacts;
- queues/background tasks for provisioning, restore, and reconciliation.

Hono and the Sandbox root entry use fetch-compatible APIs. Keep Node-only
`@tangle-network/sandbox/auth` out of Worker bundles; issue tokens with Web
Crypto or a trusted service.

Deployment checks:

- secrets are bindings, not checked-in variables;
- every object key begins with tenant and session identity;
- binary uploads use a supported binary/base64 API and enforce size limits;
- production bundles contain no `node:crypto`, filesystem, or socket-only
  dependency on Worker routes;
- request and background-task timeouts are configured from the actual plan,
  not copied constants;
- retries carry an application turn/idempotency ID;
- a stale sandbox restores required files before accepting another prompt.

For local development, point the public SDK at a supported local Sandbox API
endpoint. Do not add a permanent product-owned compatibility adapter merely to
hide an outdated local orchestrator contract.
