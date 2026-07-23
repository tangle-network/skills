# Sandbox agent UI

The sandbox reference currently publishes `@tangle-network/agent-ui@0.2.0` for
sandbox-specific auth, chat, terminal, and client helpers. Verify the published
version before copying imports.

Use wallet-backed sidecar/session auth through the package hooks. Keep user
session tokens scoped to one sandbox/instance. Chat should render structured
parts and terminal state, support abort/reconnect, and surface authorization or
runtime failure without discarding prior events.

Support two explicit client modes:

- direct sidecar mode for controlled local development;
- authenticated operator-proxy mode for production.

Do not let the browser choose an arbitrary operator or sidecar URL without an
allowlist and service-instance binding.

Lazy-load terminal dependencies. For an embedded UI, build static assets before
the Rust binary and embed the output directory at compile time. Test history
fallback, content types, cache headers, and that API routes cannot be shadowed
by the static-file fallback.

Keep the package's current public entry points and source paths in
`reference-map.md`; avoid copying component prop tables that drift with every UI
release.
