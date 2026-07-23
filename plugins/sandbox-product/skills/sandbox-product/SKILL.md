---
name: sandbox-product
description: Build on sandbox with sessions, browser streaming, scoped tokens, usage, billing, and edge.
---

# Sandbox Product

Use the public Sandbox SDK as the product boundary. Keep write/control requests
short and let the browser connect directly to the session gateway for long-lived
read events.

## Architecture

```text
browser -- short authenticated write --> product API -- SDK --> sandbox
browser <-- scoped direct event stream ---------------- session gateway
product API <-- authoritative usage/result ------------ platform callback/query
```

The browser may render events, but it is not an authority for token usage,
credits, completion state, or access control.

## Build order

1. Create or reconnect a sandbox and persist its stable ID.
2. Wait for readiness outside the latency-sensitive request when provisioning
   may exceed the request budget.
3. Persist a browser session ID and one server-controlled runtime session ID
   per logical turn.
4. Start the turn with `dispatchPrompt` and the runtime session ID.
5. Map the browser session ID to the returned runtime session ID.
6. Issue a short-lived scoped read token for the browser session ID.
7. Return gateway connection data to the browser.
8. Stream events through `SessionGatewayClient`, with top-level token refresh.
9. Persist completion and debit usage from an authoritative server source.
10. Reconnect or reprovision safely when sandbox lookup or mapping fails.

## Read only what the task needs

- For provisioning, current token/session arguments, mapping, and prompt
  kickoff, read [worker-direct-connect.md](references/worker-direct-connect.md).
- For browser events, reconnect, replay, and token refresh, read
  [browser-session.md](references/browser-session.md).
- For trustworthy usage, idempotency, credits, and message persistence, read
  [server-authoritative-billing.md](references/server-authoritative-billing.md).
- For Worker/Hono state and deployment patterns, read
  [edge-deployment.md](references/edge-deployment.md).
- Only when the public SDK cannot express a required operation, read
  [direct-api.md](references/direct-api.md).

## Hard rules

- Depend on `@tangle-network/sandbox`, not internal orchestrator or sidecar
  packages.
- Never proxy a long agent event stream through a short-lived edge request.
- Use `dispatchPrompt` for fire-and-detach edge starts; do not hold
  `box.prompt` open through request-scoped `waitUntil`.
- Never expose a signing secret or platform API key to the browser.
- Register mapping before returning connection data.
- Reuse both the stored SDK session ID and turn ID when retrying one logical
  message; SDK turn deduplication is scoped to that pair.
- Read the installed declarations for `registerSessionMapping`; current
  packages bind a browser session ID to a distinct runtime session ID.
- Use `sandboxId`, not the removed `sidecarId`, when issuing read tokens.
- Configure refresh with `SessionGatewayClientConfig.onTokenRefresh`; the
  `onTokenExpiring` event handler is notification-only.
- Treat `error` followed by terminal `done` as a failed run.
- Reuse stored sandbox IDs and classify lookup, mapping, and prompt failures
  before provisioning a replacement.
- Scope KV/D1/R2 keys by tenant and session.
- Never debit credits from browser-reported token counts.
- Do not publish placeholder stream parsers or zero-token fake results.

## Completion evidence

- a real sandbox reaches running and reconnects by stored ID;
- the published mapping call binds the browser session to the dispatched
  runtime session;
- a browser reconnect resumes without starting a duplicate turn;
- token refresh uses `onTokenRefresh` and updates the live client;
- malformed/expired tokens and cross-user sessions are rejected;
- authoritative usage is idempotently persisted and charged once;
- an unavailable sandbox triggers reprovision and document/config restoration;
- edge handlers return within their configured request budget;
- the production bundle contains no Node-only import on Worker paths.

## Then consider

- Use `sandbox-ui-adoption` after the transport works when adopting the current
  Tangle component and token system.
- Use `sandbox-blueprint` when building the operator infrastructure that
  provisions the sandboxes rather than consuming the public SDK.
- Use `sandbox-sdk-integration` when reviewing replay/idempotency behavior in an
  existing integration instead of building a complete product.
