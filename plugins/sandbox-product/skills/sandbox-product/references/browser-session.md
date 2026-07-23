# Browser session gateway

Use the browser-safe `@tangle-network/sandbox/session-gateway` entry point.

```ts
import { SessionGatewayClient } from '@tangle-network/sandbox/session-gateway'

const client = new SessionGatewayClient({
  url: gatewayUrl,
  token,
  sessionId: sdkSessionId,
  channels: [`session:${sdkSessionId}`],
  autoReconnect: true,
  onTokenRefresh: async () => {
    const next = await api.refreshSessionToken(applicationSessionId)
    return { token: next.token, expiresAt: next.expiresAt }
  },
  handlers: {
    onAgentEvent: (_channel, event, sequenceId) => {
      applyRuntimeEvent(event, sequenceId)
    },
    onTokenExpiring: (secondsRemaining) => {
      showRefreshState(secondsRemaining)
    },
    onDisconnect: (code, reason) => {
      if (turnIsActive()) showConnectionLoss(code, reason)
    },
    onError: (message, code) => showGatewayError(message, code),
  },
})

client.connect()
```

`onTokenExpiring` is a notification and returns void. Automatic refresh calls
the top-level `onTokenRefresh` callback.

Handle at least text updates, tool/reasoning parts, interaction requests,
runtime errors, and terminal `result`/`done`. Do not assume every `done` means
success; inspect status and any preceding error.

Enable replay persistence only when cross-tab/process recovery is required and
scope storage keys by tenant/session. The SDK already provides reconnect,
ping/pong, event deduplication, and replay tracking; do not add a second ring
buffer or event-ID implementation in the product.

The browser may accumulate text for display, but server state remains
authoritative. Send only turn IDs or user-visible content that the server can
reconcile; never send trusted token/cost totals from the browser.
