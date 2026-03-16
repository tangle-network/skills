# Sandbox Product Builder

Build products and SaaS applications on the Tangle Sandbox SDK with edge-first architecture.

## When to Use

- Building a product that provisions AI agent sandboxes for end users
- Implementing direct-connect streaming (browser WebSocket to orchestrator)
- Deploying on Cloudflare Workers/Pages (or any edge compute with short request limits)
- Integrating token auth, billing, and session management

## Key Concepts

- **Direct-connect streaming**: Backend issues a JWT, frontend connects directly to orchestrator via WebSocket. Backend never proxies streaming data.
- **Fire-and-forget**: Backend runs `streamPrompt()` in the background for billing/persistence. Frontend gets events independently.
- **Edge-compatible**: All backend requests complete in milliseconds. Long-lived connections are browser-to-orchestrator only.

## Related Skills

- `sandbox-sdk` — Internal SDK ecosystem (sidecar, providers, SSE primitives)
- `sandbox-blueprint` — Infrastructure blueprint (operator API, on-chain jobs)
- `blueprint-frontend` — Blueprint frontend (job submission, operator discovery)
