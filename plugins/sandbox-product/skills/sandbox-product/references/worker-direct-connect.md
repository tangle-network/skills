# Worker Direct Connect

## Check The Installed API

Read the consuming product's lockfile and the installed declarations for:

- `dispatchPrompt`;
- `registerSessionMapping`;
- `mintScopedToken`;
- `SessionGatewayClient`.

Do not copy a package version or old argument list from this reference.

## Identities

Keep four identities distinct:

- application session ID: the product's conversation or workspace row;
- client turn ID: the product's idempotency key for one user message;
- runtime session ID: the server-controlled agent execution ID;
- browser session ID: the stable browser gateway channel.

Persist them before dispatch.
Retries of one logical turn reuse the client turn and runtime session IDs.
A new logical turn receives a new runtime session ID.
Never accept a caller-selected runtime session ID without deriving or verifying ownership server-side.

## Provisioning

Create the SDK client only on the server with its API key and base URL.
Persist the sandbox ID immediately after creation.
Reconnect with `client.get(id)` before provisioning a replacement.

Provisioning may outlive an edge request.
Return a product-owned provisioning record and use a durable queue or background mechanism to wait, deploy files, and mark readiness.

## Dispatch And Mapping

Use the exact installed types.
The current flow has this shape:

```ts
const runtimeSessionId = await getOrCreateRuntimeSessionId({
  applicationSessionId,
  clientTurnId,
})
const turnId = await getOrCreateTurnId({
  applicationSessionId,
  clientTurnId,
  message,
})

const dispatched = await box.dispatchPrompt(message, {
  sessionId: runtimeSessionId,
  turnId,
  backend: { type: 'claude-code' },
})

const browserSessionId = await getOrCreateBrowserSessionId({
  applicationSessionId,
  userId,
})

const mapping = await box.registerSessionMapping({
  sessionId: browserSessionId,
  userId,
  runtimeSessionId: dispatched.sessionId,
})

if (!mapping.success) {
  if (mapping.reprovisionRequired) await scheduleReprovision(box.id)
  throw new Error(mapping.code ?? 'session mapping failed')
}
```

Use a model available to the selected backend.
Do not treat an example model as a permanent default.
Use `dispatchPrompt` for fire-and-detach edge starts instead of holding a prompt stream open in a request-scoped task.

## Token And Browser Response

Prefer the SDK's server-side scoped-token method over signing product tokens by hand:

```ts
const scoped = await box.mintScopedToken({
  scope: 'session',
  sessionId: browserSessionId,
})

return json({
  applicationSessionId,
  sessionId: browserSessionId,
  sandboxId: box.id,
  gatewayUrl,
  token: scoped.token,
  expiresAt: scoped.expiresAt,
})
```

Return only browser-safe values.
Keep platform keys and signing authority on the server.
The browser connects with `SessionGatewayClient` using the browser session ID and refreshes tokens through an authenticated product endpoint.

## Recovery

- Resolve the current sandbox and gateway URL on reconnect because containers move.
- Reuse stored runtime session and turn IDs after request retries or process restarts.
- Treat mapping failures as typed failures; a stale mapping requires reprovisioning rather than a low agent score.
- Restore product files and configuration after reprovisioning.
- Persist prompt-start and terminal failures in server-owned status records.
- Charge usage from authoritative platform results, never browser counters.
