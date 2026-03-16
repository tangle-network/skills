---
name: sandbox-product
description: Use when building a product or SaaS on top of the Tangle Sandbox SDK — provisioning sandboxes, streaming agent output to browsers via direct-connect WebSocket, issuing auth tokens, and deploying on Cloudflare Workers/Pages.
---

# Sandbox Product Builder

Use this skill when building a product that uses the `@tangle-network/sandbox` SDK to provision AI agent sandboxes and stream their output to end users. This covers the **product-side** of the stack — how to consume the SDK, authenticate users, stream events, and deploy on edge compute.

For the internal SDK internals (sidecar, providers, SSE primitives), see `sandbox-sdk`.
For the infrastructure blueprint (operator API, on-chain jobs), see `sandbox-blueprint`.

## What This Skill Covers

- Provisioning sandboxes via the public SDK (`Sandbox.create()`, `SandboxInstance`)
- Direct-connect streaming (frontend WebSocket to orchestrator, no backend proxy)
- Token issuance with `ProductTokenIssuer` (server-side JWT signing)
- Browser WebSocket client with `SessionGatewayClient` (auto-reconnect, token refresh)
- Session mapping registration (route sidecar events to frontend)
- Cloudflare Workers deployment (short-lived handlers, no long connections)
- Credit/billing integration patterns
- Local development with the SDK adapter

## The Only Dependency

**`@tangle-network/sandbox`** is the only package you should ever depend on. It has three entry points:

| Import | Environment | Purpose |
|--------|-------------|---------|
| `@tangle-network/sandbox` | Server | Sandbox provisioning, lifecycle, file ops, prompting |
| `@tangle-network/sandbox/auth` | Server (Node.js) | JWT token issuance for WebSocket auth |
| `@tangle-network/sandbox/session-gateway` | Browser | WebSocket client for direct streaming |

Never import `@tangle-network/sdk`, `@tangle-network/sdk-core`, `@tangle-network/agent-interface`, or any other internal package. If you need functionality that isn't in `@tangle-network/sandbox`, it should be added to the SDK — not worked around by importing internals.

## Architecture: Direct-Connect Streaming

The core pattern for production products. The backend never proxies streaming data.

```
Browser                          Backend (Worker)                 Orchestrator
  │                                   │                               │
  │  POST /api/chat {message}         │                               │
  │──────────────────────────────────>│                               │
  │                                   │  sandbox.startTurn()          │
  │                                   │  box.registerSessionMapping() │
  │                                   │  issueToken()                 │
  │                                   │──────────────────────────────>│
  │   { token, orchestratorUrl }      │                               │
  │<──────────────────────────────────│                               │
  │                                   │                               │
  │   WebSocket connect (token)       │                               │
  │──────────────────────────────────────────────────────────────────>│
  │                                   │                               │
  │   message.part.updated (delta)    │                               │
  │<─────────────────────────────────────────────────────────────────│
  │   message.part.updated (delta)    │                               │
  │<─────────────────────────────────────────────────────────────────│
  │   result                          │                               │
  │<─────────────────────────────────────────────────────────────────│
  │                                   │                               │
  │                                   │  (background) streamPrompt()  │
  │                                   │  debit credits, persist msg   │
  │                                   │──────────────────────────────>│
```

**Why this pattern:**
- Backend requests are short-lived (milliseconds) — works on Cloudflare Workers (30s CPU limit)
- Streaming sessions last minutes to hours — only the browser holds the long connection
- Reconnection goes directly to orchestrator without restarting the prompt
- Backend still handles billing/persistence via fire-and-forget background execution

## Step 1: Sandbox Provisioning (Server)

```typescript
import { Sandbox } from "@tangle-network/sandbox";

const client = new Sandbox({
  apiKey: process.env.TANGLE_API_KEY!,
  baseUrl: process.env.SANDBOX_API_URL,  // optional, for local dev
  timeout: 120_000,
});

// Create a sandbox
const box = await client.create({
  image: "python:3.12-slim",
  env: { TAX_YEAR: "2025", WORKSPACE: "/home/agent" },
});

await box.waitFor("running", { timeout: 120_000 });

// File operations
await box.write("/home/agent/data.csv", csvContent);
const result = await box.exec("python process.py");
const output = await box.read("/home/agent/output.json");

// Binary files: write() is text-only, use base64
await box.write("/tmp/doc.b64", base64Content);
await box.exec("base64 -d /tmp/doc.b64 > /home/agent/doc.pdf && rm /tmp/doc.b64");

// Cleanup
await box.delete();
```

### Sandbox Reconnection

Sandboxes outlive individual requests. Cache the sandbox ID and reconnect:

```typescript
// On first request: create and store ID
const box = await client.create({ image: "python:3.12-slim" });
await db.update(session).set({ projectRef: box.id });

// On subsequent requests: reconnect by ID
const existing = await client.get(storedProjectRef);
if (existing && existing.status === "running") {
  return existing;  // reuse
}
// Dead or missing — re-provision
const fresh = await client.create({ ... });
```

## Step 2: Token Issuance (Server)

Issue JWTs so the browser can authenticate with the orchestrator's WebSocket.

```typescript
import { ProductTokenIssuer } from "@tangle-network/sandbox/auth";

// Initialize once at startup
const issuer = new ProductTokenIssuer({
  productId: process.env.ORCHESTRATOR_PRODUCT_ID!,
  signingSecret: process.env.ORCHESTRATOR_SIGNING_SECRET!,
  ttlMinutes: { free: 30, paid: 240 },
});

// Issue per-request
const { token, expiresAt } = issuer.issue({
  userId: "user_123",
  sessionId: "sess_abc",
  tier: "paid",
  sidecarId: box.id,  // optional: scope to specific container
});

const ttlMinutes = issuer.getTtlMinutes("paid");
```

**Environment variables needed:**
- `ORCHESTRATOR_PRODUCT_ID` — your product's ID in the orchestrator
- `ORCHESTRATOR_SIGNING_SECRET` — HMAC secret shared with orchestrator

The `ProductTokenIssuer` uses HMAC-SHA256 (node:crypto). It is server-only — never expose the signing secret to the browser.

## Step 3: Session Mapping (Server)

Tell the orchestrator which sidecar events should route to the frontend WebSocket channel:

```typescript
// After ensuring sandbox is running, before returning token to frontend
await box.registerSessionMapping({
  sessionId: agentSessionId,  // the sidecar's session ID
  userId: userId,
});
```

This `PUT /v1/session/:sessionId/mapping` call tells the orchestrator: "when this sidecar emits events for this session, route them to the `session:{sessionId}` WebSocket channel."

## Step 4: Background Prompt Execution (Server)

Fire-and-forget — the frontend gets events via WebSocket, the backend just handles billing:

```typescript
// Don't await this — it runs in the background
runPromptInBackground(box, sessionId, userId, message, model);

async function runPromptInBackground(
  box: SandboxInstance,
  sessionId: string,
  userId: string,
  message: string,
  model: string,
) {
  let fullText = "";
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    for await (const event of box.streamPrompt(message, {
      backend: { type: "claude-code", model: { model } },
    })) {
      if (event.type === "message.part.updated") {
        const delta = event.data?.delta as string | undefined;
        if (delta) fullText += delta;
      }
      if (event.type === "result") {
        const usage = event.data?.tokenUsage;
        inputTokens = usage?.inputTokens ?? 0;
        outputTokens = usage?.outputTokens ?? 0;
      }
    }

    // Debit credits based on actual usage
    await credits.debit(userId, model, inputTokens, outputTokens, sessionId);

    // Persist assistant message
    await db.insert(chatMessages).values({
      sessionId, role: "assistant", content: fullText,
      model, inputTokens, outputTokens,
    });
  } catch (e) {
    console.error("Background prompt failed:", e);
  }
}
```

## Step 5: Chat Endpoint (Server)

The chat endpoint is a short-lived JSON request — no streaming:

```typescript
app.post("/api/sessions/:id/chat", async (c) => {
  const { id } = c.req.param();
  const { message } = await c.req.json();
  const userId = c.get("userId");

  // 1. Check credits
  if (!(await credits.canStartTurn(userId))) {
    return c.json({ error: "Insufficient credits" }, 402);
  }

  // 2. Ensure sandbox is running (reconnect or provision)
  const box = await ensureSandbox(id, userId);

  // 3. Register session mapping for WebSocket routing
  await box.registerSessionMapping({ sessionId: agentSessionId, userId });

  // 4. Fire-and-forget background prompt
  runPromptInBackground(box, id, userId, message, model);

  // 5. Issue token for frontend WebSocket
  const { token, expiresAt } = issuer.issue({
    userId, sessionId: agentSessionId, tier: userTier, sidecarId: box.id,
  });
  const ttlMinutes = issuer.getTtlMinutes(userTier);

  // 6. Return connection info (short-lived response, milliseconds)
  return c.json({
    token,
    expiresAt,
    ttlMinutes,
    orchestratorUrl: process.env.TANGLE_ORCHESTRATOR_URL,
    containerId: box.id,
    agentSessionId,
  });
});
```

### Token Refresh Endpoint

```typescript
app.get("/api/sessions/:id/token", async (c) => {
  const session = await db.query.taxSessions.findFirst({ ... });
  const { token, expiresAt } = issuer.issue({
    userId, sessionId: session.agentSessionId, tier: userTier,
  });
  return c.json({ token, expiresAt, ttlMinutes: issuer.getTtlMinutes(userTier) });
});
```

## Step 6: Browser WebSocket Client

```typescript
import { SessionGatewayClient } from "@tangle-network/sandbox/session-gateway";

// After POST /api/sessions/:id/chat returns turnInfo:
const wsUrl = turnInfo.orchestratorUrl
  .replace(/^http:/, "ws:")
  .replace(/^https:/, "wss:")
  + "/session";

const client = new SessionGatewayClient({
  url: wsUrl,
  token: turnInfo.token,
  sessionId: turnInfo.agentSessionId,
  channels: [`session:${turnInfo.agentSessionId}`],
  autoReconnect: true,
  handlers: {
    onAgentEvent: (_channel: string, data: unknown) => {
      const event = data as Record<string, unknown>;
      const eventType = event.type as string;

      if (eventType === "message.part.updated") {
        const eventData = event.data as Record<string, unknown> | undefined;
        const delta = eventData?.delta as string | undefined;
        const part = eventData?.part as Record<string, unknown> | undefined;
        if (part?.type === "text" && delta) {
          appendToMessage(delta);  // Update UI
        }
      } else if (eventType === "result" || eventType === "done") {
        setStreaming(false);
        client.disconnect();
      } else if (eventType === "error") {
        const msg = (event.data as any)?.message || "Agent error";
        showError(msg);
        client.disconnect();
      }
    },

    onTokenExpiring: async () => {
      // Called when token is about to expire — fetch a fresh one
      const refreshed = await api.sessions.refreshToken(sessionId);
      return { token: refreshed.token, expiresAt: refreshed.expiresAt };
    },

    onDisconnect: (code: number, reason: string) => {
      if (stillStreaming) {
        showError(`Connection lost: ${reason || `code ${code}`}`);
      }
    },

    onError: (error: unknown) => {
      console.error("[ws] Error:", error);
    },
  },
});

client.connect();
```

### SessionGatewayClient Features

| Feature | Default | Notes |
|---------|---------|-------|
| Auto-reconnect | `true` | Exponential backoff, max 10 attempts |
| Ping/pong | 30s interval | Detects dead connections |
| Event deduplication | Enabled | Prevents duplicate events on reconnect |
| Replay persistence | Disabled | Enable for cross-tab recovery (uses localStorage) |
| Token refresh | Via callback | `onTokenExpiring` fires before expiry |
| Channel subscription | Manual | Subscribe to `session:{id}` channels |

## Cloudflare Workers Deployment

### Why Direct-Connect is Required

Cloudflare Workers have a **30-second CPU time limit** (even paid plans cap at 6 minutes). Agent sessions run 10-60+ minutes. You cannot proxy streaming through a Worker.

The direct-connect pattern makes every Worker request short-lived:
- `POST /chat` — provision + issue token (~1-5s)
- `GET /token` — refresh token (~50ms)
- `POST /upload` — file upload (~1-2s)

### Architecture

```
Cloudflare Pages          Cloudflare Worker           Tangle Orchestrator
(Static React SPA)        (API, short-lived)          (Long-lived containers)
       │                        │                            │
       │  fetch /api/chat       │                            │
       │───────────────────────>│  Sandbox.create()          │
       │                        │───────────────────────────>│
       │  { token, wsUrl }      │                            │
       │<───────────────────────│                            │
       │                        │                            │
       │  WebSocket (direct, long-lived)                     │
       │────────────────────────────────────────────────────>│
       │  streaming events...                                │
       │<───────────────────────────────────────────────────│
```

### Worker Constraints

| Constraint | Impact | Solution |
|-----------|--------|---------|
| 30s CPU limit | Can't proxy streams | Direct-connect: browser → orchestrator |
| No outbound WebSocket | Can't consume sidecar events | Fire-and-forget: `streamPrompt()` runs in orchestrator |
| 128MB memory | Can't buffer large responses | Streaming to browser, not Worker |
| No persistent state | Can't cache sandbox connections | Use KV/D1 for session→sandbox mapping |
| Cold starts ~5ms | Negligible for JSON endpoints | N/A |

### Worker-Specific Patterns

**KV for session mapping** (instead of in-memory cache):
```typescript
// Store sandbox reference
await env.SESSIONS.put(`session:${id}`, JSON.stringify({
  projectRef: box.id,
  agentSessionId,
  createdAt: Date.now(),
}), { expirationTtl: 86400 });

// Retrieve on next request
const cached = await env.SESSIONS.get(`session:${id}`, "json");
```

**D1 for persistent data** (users, billing, chat history):
```typescript
const messages = await env.DB.prepare(
  "SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at"
).bind(sessionId).all();
```

**R2 for document storage** (uploaded files):
```typescript
await env.DOCUMENTS.put(`${sessionId}/${filename}`, file.stream());
const doc = await env.DOCUMENTS.get(`${sessionId}/${filename}`);
```

### Hono on Workers

Hono runs natively on Cloudflare Workers with zero adapter overhead:

```typescript
import { Hono } from "hono";

const app = new Hono<{ Bindings: Env }>();

app.post("/api/sessions/:id/chat", async (c) => {
  const client = new Sandbox({
    apiKey: c.env.TANGLE_API_KEY,
    baseUrl: c.env.SANDBOX_API_URL,
  });
  // ... same logic as Node.js, but use KV/D1 instead of pg
});

export default app;
```

### wrangler.toml

```toml
name = "my-product-api"
main = "src/index.ts"
compatibility_date = "2024-12-01"

[vars]
TANGLE_ORCHESTRATOR_URL = "https://agents.tangle.network"

[[kv_namespaces]]
binding = "SESSIONS"
id = "abc123"

[[d1_databases]]
binding = "DB"
database_name = "my-product"
database_id = "def456"

[[r2_buckets]]
binding = "DOCUMENTS"
bucket_name = "my-product-docs"
```

### Pages for Frontend

Deploy the React/Next.js frontend on Cloudflare Pages:

```bash
# Static export for Pages
npx next build
npx wrangler pages deploy out/
```

Or use `@cloudflare/next-on-pages` for SSR on Pages Functions.

## Local Development

### SDK Adapter for Local Orchestrator

When `SANDBOX_API_URL` is not set, start a local adapter that translates SDK calls to your local orchestrator:

```typescript
import { Sandbox } from "@tangle-network/sandbox";

// Points to local orchestrator adapter
const client = new Sandbox({
  apiKey: process.env.TANGLE_API_KEY!,
  baseUrl: "http://localhost:8787",  // local adapter
  timeout: 120_000,
});
```

The adapter translates:
- `POST /v1/sandboxes` → `POST /projects` (orchestrator)
- `GET /v1/sandboxes/:id` → `GET /projects/:id`
- `DELETE /v1/sandboxes/:id` → `DELETE /projects/:id`
- `/v1/sandboxes/:id/runtime/*` → proxy to sidecar

### Environment Variables

```bash
# Required
TANGLE_API_KEY=orch_prod_...           # Orchestrator API key
TANGLE_ORCHESTRATOR_URL=http://localhost:4095  # Local orchestrator

# For direct-connect streaming
ORCHESTRATOR_PRODUCT_ID=legacy         # Product ID in orchestrator
ORCHESTRATOR_SIGNING_SECRET=orch_sign_...  # Shared HMAC secret

# Optional
SANDBOX_API_URL=                       # Leave unset for local adapter auto-start
SANDBOX_IMAGE=python:3.12-slim        # Default container image
```

## Rules

1. **Only depend on `@tangle-network/sandbox`.**
   Never import internal packages. If you need something, add it to the SDK.

2. **Backend requests must be short-lived.**
   No SSE streaming through the backend. The backend issues tokens and returns JSON. The browser holds the long WebSocket connection.

3. **Fire-and-forget prompt execution.**
   `streamPrompt()` runs in the background for billing/persistence. Don't await it in the request handler. The frontend gets events via WebSocket independently.

4. **Always register session mapping before returning token.**
   `box.registerSessionMapping()` must complete before the frontend connects, or events will be lost.

5. **Handle sandbox reconnection gracefully.**
   Sandboxes can die. Always try to reconnect by stored `projectRef` before provisioning a new one. Re-sync documents on re-provision.

6. **Token refresh is the frontend's responsibility.**
   The `onTokenExpiring` callback fires before the JWT expires. The frontend calls the backend's refresh endpoint and passes the new token back to the client.

7. **Use Cloudflare primitives for state.**
   KV for ephemeral session data, D1 for persistent data, R2 for files. Don't try to use in-memory caches or PostgreSQL connections from Workers.

## Event Types Reference

Events received via `SessionGatewayClient.onAgentEvent`:

| Event Type | Data | Description |
|-----------|------|-------------|
| `message.part.updated` | `{ part: { type: "text" }, delta: "..." }` | Text content streaming |
| `message.part.updated` | `{ part: { type: "tool" }, ... }` | Tool execution state |
| `message.part.updated` | `{ part: { type: "reasoning" }, ... }` | Model thinking content |
| `result` | `{ tokenUsage: { inputTokens, outputTokens } }` | Execution complete |
| `done` | `{}` | Session turn finished |
| `error` | `{ message: "..." }` | Error occurred |
| `status` | `{ status: "..." }` | Status update |

## Validation Checklist

When building a product on this stack:

- [ ] Only `@tangle-network/sandbox` in dependencies (no internal packages)
- [ ] Chat endpoint returns JSON (no SSE/streaming through backend)
- [ ] `registerSessionMapping()` called before returning token
- [ ] `streamPrompt()` runs in background (not awaited in request handler)
- [ ] `SessionGatewayClient` handles `onTokenExpiring` with refresh callback
- [ ] `onDisconnect` handler shows user-facing error if still streaming
- [ ] Sandbox reconnection logic (don't provision a new one every request)
- [ ] Worker request handlers complete in < 30s
- [ ] No `pg` or `node:` imports in Worker code (use KV/D1/R2)
- [ ] Binary files use base64 encode/decode through `write()` + `exec()`
