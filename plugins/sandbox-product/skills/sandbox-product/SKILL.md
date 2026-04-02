---
name: sandbox-product
description: Use when building a product or SaaS on top of the Tangle Sandbox SDK — provisioning sandboxes, streaming agent output to browsers via direct-connect WebSocket, issuing auth tokens, and deploying on Cloudflare Workers/Pages. No Node.js backend required.
---

# Sandbox Product Builder

Use this skill when building a product that uses the `@tangle-network/sandbox` SDK to provision AI agent sandboxes and stream their output to end users. This covers the **product-side** of the stack — how to consume the SDK, authenticate users, stream events, and deploy on edge compute.

**You do NOT need a Node.js backend.** Everything runs on Cloudflare Workers + direct-connect WebSocket. The Worker handles all writes (provisioning, file ops, billing, persistence). The browser holds the long-lived WebSocket connection for reads (streaming agent output). No intermediary server.

For the internal SDK internals (sidecar, providers, SSE primitives), see `sandbox-sdk`.
For the infrastructure blueprint (operator API, on-chain jobs), see `sandbox-blueprint`.

## What This Skill Covers

- Provisioning sandboxes via the public SDK (`Sandbox.create()`, `SandboxInstance`)
- Direct-connect streaming (frontend WebSocket to orchestrator, no backend proxy)
- Token issuance — both `ProductTokenIssuer` (Node.js) and Web Crypto API (Workers)
- Browser WebSocket client with `SessionGatewayClient` (auto-reconnect, token refresh)
- Session mapping registration (route sidecar events to frontend)
- **Worker-only deployment** — no Node.js server, everything on Cloudflare Workers
- Frontend-reported billing (frontend sends token usage back to Worker)
- Async provisioning (Worker creates sandbox, frontend polls for readiness)
- Credit/billing integration patterns
- Local development with the SDK adapter

## The Only Dependency

**`@tangle-network/sandbox`** is the only package you should ever depend on. It has three entry points:

| Import | Environment | Purpose |
|--------|-------------|---------|
| `@tangle-network/sandbox` | Server (Node.js or Workers) | Sandbox provisioning, lifecycle, file ops, prompting |
| `@tangle-network/sandbox/auth` | Server (Node.js only) | JWT token issuance via `node:crypto` |
| `@tangle-network/sandbox/session-gateway` | Browser | WebSocket client for direct streaming |

Never import `@tangle-network/sdk`, `@tangle-network/sdk-core`, `@tangle-network/agent-interface`, or any other internal package. If you need functionality that isn't in `@tangle-network/sandbox`, it should be added to the SDK — not worked around by importing internals.

**Workers note:** `@tangle-network/sandbox/auth` uses `node:crypto` and won't work in Cloudflare Workers. Use the Web Crypto API pattern (Step 2b below) instead.

## Architecture: Direct-Connect Streaming

The core pattern for production products. **The backend never proxies streaming data.** Write operations go through the Worker. The read stream goes directly from orchestrator to browser.

```
Browser                          Worker (Hono)                    Orchestrator
  │                                   │                               │
  │  POST /api/chat {message}         │                               │
  │──────────────────────────────────>│                               │
  │                                   │  Sandbox.create() or get()    │
  │                                   │  box.registerSessionMapping() │
  │                                   │  signToken() (Web Crypto)     │
  │                                   │──────────────────────────────>│
  │   { token, orchestratorUrl }      │                               │
  │<──────────────────────────────────│                               │
  │                                   │                               │
  │   WebSocket connect (token)       │                               │
  │──────────────────────────────────────────────────────────────────>│
  │                                   │                               │
  │   message.part.updated (delta)    │  ctx.waitUntil(startPrompt()) │
  │<─────────────────────────────────────────────────────────────────│
  │   message.part.updated (delta)    │                               │
  │<─────────────────────────────────────────────────────────────────│
  │   result {tokenUsage}             │                               │
  │<─────────────────────────────────────────────────────────────────│
  │                                   │                               │
  │  POST /api/sessions/:id/complete  │                               │
  │  {content, inputTokens, ...}      │                               │
  │──────────────────────────────────>│  debit credits, persist msg   │
  │   200 OK                          │                               │
  │<──────────────────────────────────│                               │
```

**Why this pattern:**
- Worker requests are short-lived (milliseconds) — works within Cloudflare Workers 30s CPU limit
- Streaming sessions last minutes to hours — only the browser holds the long connection
- Reconnection goes directly to orchestrator without restarting the prompt
- Billing data flows from frontend `result` event back to Worker — no backend stream consumption needed
- **Zero Node.js infrastructure to maintain**

### Two Architectures Compared

| | Worker-Only (recommended) | Worker + Node.js Backend |
|---|---|---|
| **Provisioning** | Worker calls SDK directly | Worker → Node.js → SDK |
| **Prompt kickoff** | `ctx.waitUntil(box.prompt())` or orchestrator REST | Node.js calls `streamPrompt()` |
| **Billing** | Frontend reports `result` event to Worker | Node.js consumes stream for token usage |
| **Streaming** | Browser → orchestrator WebSocket (same) | Same |
| **Infrastructure** | CF Worker only | CF Worker + Node.js server + HMAC auth |
| **Latency** | 1 hop | 2 hops (Worker → Node → orchestrator) |
| **Complexity** | Low | High (HMAC signing, internal webhooks, process management) |

**Use Worker + Node.js only if** you need server-side stream processing (custom analytics, audit logging of every token). For most products, Worker-only is simpler and sufficient.

## Step 1: Sandbox Provisioning (Worker or Node.js)

The `Sandbox` client uses `fetch()` internally — it works in both Workers and Node.js.

```typescript
import { Sandbox } from "@tangle-network/sandbox";

const client = new Sandbox({
  apiKey: env.TANGLE_API_KEY,
  baseUrl: env.SANDBOX_API_URL,  // optional, for local dev
  timeout: 120_000,
});

// Create a sandbox — this is a quick POST, returns immediately with ID
const box = await client.create({
  image: "python:3.12-slim",
  env: { TAX_YEAR: "2025", WORKSPACE: "/home/agent" },
});

// Wait for container to be ready (can take 30-120s)
await box.waitFor("running", { timeout: 120_000 });

// File operations (each is a single HTTP call)
await box.write("/home/agent/data.csv", csvContent);
const result = await box.exec("python process.py");
const output = await box.read("/home/agent/output.json");

// Binary files: write() is text-only, use base64
await box.write("/tmp/doc.b64", base64Content);
await box.exec("base64 -d /tmp/doc.b64 > /home/agent/doc.pdf && rm /tmp/doc.b64");

// Cleanup
await box.delete();
```

### Async Provisioning (Worker Pattern)

`waitFor()` can take 2 minutes, which exceeds Worker CPU limits. Use async provisioning:

```typescript
app.post("/api/sessions", async (c) => {
  const userId = c.get("userId");

  // 1. Create sandbox — quick POST, returns sandbox ID immediately
  const box = await client.create({
    image: "python:3.12-slim",
    env: { TAX_YEAR: "2025" },
  });

  // 2. Store sandbox ID in D1
  const sessionId = crypto.randomUUID();
  await c.env.DB.prepare(
    "INSERT INTO sessions (id, user_id, project_ref, status) VALUES (?, ?, ?, ?)"
  ).bind(sessionId, userId, box.id, "provisioning").run();

  // 3. Use waitUntil to continue provisioning after response
  c.executionCtx.waitUntil(finishProvisioning(c.env, sessionId, box));

  // 4. Return immediately — frontend polls for readiness
  return c.json({ sessionId, status: "provisioning" });
});

async function finishProvisioning(env: Env, sessionId: string, box: SandboxInstance) {
  try {
    await box.waitFor("running", { timeout: 120_000 });

    // Deploy files, configure agent, etc.
    await box.write("/home/agent/config.json", JSON.stringify({ ... }));

    await env.DB.prepare(
      "UPDATE sessions SET status = 'ready', project_ref = ? WHERE id = ?"
    ).bind(box.id, sessionId).run();
  } catch (e) {
    await env.DB.prepare(
      "UPDATE sessions SET status = 'failed' WHERE id = ?"
    ).bind(sessionId).run();
  }
}

// Frontend polls this until status === "ready"
app.get("/api/sessions/:id/status", async (c) => {
  const row = await c.env.DB.prepare(
    "SELECT status, project_ref FROM sessions WHERE id = ?"
  ).bind(c.req.param("id")).first();
  return c.json(row);
});
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

## Step 2a: Token Issuance — Node.js (ProductTokenIssuer)

If running Node.js, use the SDK's built-in issuer:

```typescript
import { ProductTokenIssuer } from "@tangle-network/sandbox/auth";

const issuer = new ProductTokenIssuer({
  productId: process.env.ORCHESTRATOR_PRODUCT_ID!,
  signingSecret: process.env.ORCHESTRATOR_SIGNING_SECRET!,
  ttlMinutes: { free: 30, paid: 240 },
});

const { token, expiresAt } = issuer.issue({
  userId: "user_123",
  sessionId: "sess_abc",
  tier: "paid",
  sidecarId: box.id,
});
```

## Step 2b: Token Issuance — Cloudflare Workers (Web Crypto API)

`ProductTokenIssuer` uses `node:crypto` which doesn't exist in Workers. Use Web Crypto directly:

```typescript
// ---- Token signing for Cloudflare Workers ----

const encoder = new TextEncoder();

function base64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function signToken(
  env: { ORCHESTRATOR_PRODUCT_ID: string; ORCHESTRATOR_SIGNING_SECRET: string },
  opts: {
    userId: string;
    sessionId: string;
    containerId?: string;
    ttlMinutes: number;
  }
): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + opts.ttlMinutes * 60;

  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: opts.userId,
    sid: opts.sessionId,
    pid: env.ORCHESTRATOR_PRODUCT_ID,
    ...(opts.containerId ? { cid: opts.containerId } : {}),
    typ: "read",
    iat: now,
    exp,
  };

  const headerB64 = base64url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = base64url(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.ORCHESTRATOR_SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(signingInput));

  return {
    token: `${signingInput}.${base64url(sig)}`,
    expiresAt: exp,
  };
}

// Usage in Worker:
const { token, expiresAt } = await signToken(c.env, {
  userId,
  sessionId: agentSessionId,
  containerId: box.id,
  ttlMinutes: isPro ? 240 : 30,
});
```

**Environment variables needed:**
- `ORCHESTRATOR_PRODUCT_ID` — your product's ID in the orchestrator
- `ORCHESTRATOR_SIGNING_SECRET` — HMAC secret shared with orchestrator

Never expose the signing secret to the browser.

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

## Step 4: Prompt Kickoff

### Option A: Worker-Only (ctx.waitUntil)

For prompts that complete within the Worker's extended timeout (`ctx.waitUntil` allows ~30s of additional CPU after the response is sent):

```typescript
// In the chat endpoint, AFTER returning the response:
c.executionCtx.waitUntil(
  box.prompt(message, {
    backend: { type: "claude-code", model: { model: "claude-sonnet-4-6" } },
    sessionId: agentSessionId,
  }).catch(err => console.error("Prompt kickoff failed:", err))
);
```

This works for short prompts. For long-running agent sessions (10+ minutes), the prompt itself runs inside the sidecar — the SDK `prompt()` call just tells the sidecar to start. The orchestrator/sidecar handle execution independently.

### Option B: Direct Orchestrator REST API

If the SDK's `prompt()` method blocks too long, call the orchestrator's REST API directly:

```typescript
// Fire-and-forget POST to orchestrator to start the prompt
c.executionCtx.waitUntil(
  fetch(`${env.TANGLE_ORCHESTRATOR_URL}/v1/sandboxes/${box.id}/runtime/prompt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${env.TANGLE_API_KEY}`,
    },
    body: JSON.stringify({
      message,
      backend: { type: "claude-code", model: { model: "claude-sonnet-4-6" } },
      sessionId: agentSessionId,
    }),
  }).catch(err => console.error("Prompt kickoff failed:", err))
);
```

### Option C: Node.js Backend (Legacy)

If you have a Node.js backend, it can consume the stream for server-side billing:

```typescript
async function runPromptInBackground(
  box: SandboxInstance,
  sessionId: string,
  userId: string,
  message: string,
  model: string,
) {
  let fullText = "";
  let inputTokens = 0, outputTokens = 0;

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
    await credits.debit(userId, model, inputTokens, outputTokens, sessionId);
    await db.insert(chatMessages).values({
      sessionId, role: "assistant", content: fullText,
      model, inputTokens, outputTokens,
    });
  } catch (e) {
    console.error("Background prompt failed:", e);
  }
}
```

## Step 5: Chat Endpoint

### Worker-Only Version (Recommended)

```typescript
app.post("/api/sessions/:id/chat", async (c) => {
  const { id } = c.req.param();
  const { message } = await c.req.json();
  const userId = c.get("userId");

  // 1. Check credits
  const balance = await getCredits(c.env, userId);
  if (balance <= 0) return c.json({ error: "Insufficient credits" }, 402);

  // 2. Ensure sandbox is running (reconnect or provision)
  const box = await ensureSandbox(c.env, id, userId);

  // 3. Register session mapping for WebSocket routing
  const agentSessionId = crypto.randomUUID();
  await box.registerSessionMapping({ sessionId: agentSessionId, userId });

  // 4. Persist user message
  await c.env.DB.prepare(
    "INSERT INTO chat_messages (id, session_id, role, content) VALUES (?, ?, 'user', ?)"
  ).bind(crypto.randomUUID(), id, message).run();

  // 5. Fire-and-forget prompt kickoff (runs after response sent)
  c.executionCtx.waitUntil(
    box.prompt(message, {
      backend: { type: "claude-code", model: { model: "claude-sonnet-4-6" } },
      sessionId: agentSessionId,
    }).catch(err => console.error("Prompt failed:", err))
  );

  // 6. Issue token for frontend WebSocket (Web Crypto)
  const ttlMinutes = isPro(userId) ? 240 : 30;
  const { token, expiresAt } = await signToken(c.env, {
    userId, sessionId: agentSessionId, containerId: box.id, ttlMinutes,
  });

  // 7. Return connection info — response time: ~200ms
  return c.json({
    token, expiresAt, ttlMinutes,
    orchestratorUrl: c.env.TANGLE_ORCHESTRATOR_URL,
    containerId: box.id,
    agentSessionId,
  });
});
```

### Frontend Billing Completion Endpoint

The frontend sends billing data from the `result` event back to the Worker:

```typescript
app.post("/api/sessions/:id/complete", async (c) => {
  const { id } = c.req.param();
  const userId = c.get("userId");
  const { content, inputTokens, outputTokens, model } = await c.req.json();

  // Persist assistant message
  await c.env.DB.prepare(
    "INSERT INTO chat_messages (id, session_id, role, content, model, input_tokens, output_tokens) VALUES (?, ?, 'assistant', ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), id, content, model, inputTokens, outputTokens).run();

  // Debit credits
  const creditsUsed = calculateCredits(model, inputTokens, outputTokens);
  await c.env.DB.prepare(
    "INSERT INTO credit_ledger (id, user_id, session_id, amount, description) VALUES (?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), userId, id, -creditsUsed, `${model} turn`).run();

  return c.json({ creditsUsed, remaining: await getCredits(c.env, userId) });
});
```

**Security note:** Frontend-reported billing is trustworthy because:
1. The `result` event comes from the orchestrator (not user-crafted)
2. You can validate reported usage against orchestrator logs if needed
3. For additional security, the orchestrator can callback to a Worker webhook with authoritative usage data

### Token Refresh Endpoint

```typescript
app.get("/api/sessions/:id/token", async (c) => {
  const session = await c.env.DB.prepare(
    "SELECT agent_session_id, project_ref FROM sessions WHERE id = ? AND user_id = ?"
  ).bind(c.req.param("id"), c.get("userId")).first();

  if (!session) return c.json({ error: "Not found" }, 404);

  const ttlMinutes = isPro(c.get("userId")) ? 240 : 30;
  const { token, expiresAt } = await signToken(c.env, {
    userId: c.get("userId"),
    sessionId: session.agent_session_id,
    containerId: session.project_ref,
    ttlMinutes,
  });

  return c.json({ token, expiresAt, ttlMinutes });
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
          fullText += delta;       // Accumulate for billing
        }
      } else if (eventType === "result" || eventType === "done") {
        const usage = (event.data as any)?.tokenUsage;
        setStreaming(false);
        client.disconnect();

        // Report billing to Worker
        api.sessions.complete(sessionId, {
          content: fullText,
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          model: "claude-sonnet-4-6",
        });
      } else if (eventType === "error") {
        const msg = (event.data as any)?.message || "Agent error";
        showError(msg);
        client.disconnect();
      }
    },

    onTokenExpiring: async () => {
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
- `POST /chat` — register mapping + issue token (~200ms)
- `GET /token` — refresh token (~50ms)
- `POST /upload` — file upload (~1-2s)
- `POST /complete` — billing + persistence (~100ms)

### Worker Constraints

| Constraint | Impact | Solution |
|-----------|--------|---------|
| 30s CPU limit | Can't proxy streams | Direct-connect: browser → orchestrator |
| No outbound WebSocket | Can't consume sidecar events | Frontend holds WebSocket, reports billing |
| 128MB memory | Can't buffer large responses | Streaming to browser, not Worker |
| No persistent state | Can't cache sandbox connections | Use KV/D1 for session→sandbox mapping |
| `ctx.waitUntil` up to 15min (paid) | Can provision + deploy, not stream | Async provisioning (create → deploy → update D1) |
| No `node:crypto` (Workers) | Can't use ProductTokenIssuer | Web Crypto API (Step 2b) |

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
await env.DOCUMENTS.put(`${userId}/${sessionId}/${filename}`, file.stream());
const doc = await env.DOCUMENTS.get(`${userId}/${sessionId}/${filename}`);
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
  // ... same patterns as above
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

## SDK-Free Alternative: Direct Orchestrator API

For **maximum Worker compatibility**, skip the SDK entirely and call the orchestrator REST API directly. This eliminates all `node:` import issues and the adapter requirement.

### Orchestrator HTTP Client (Worker-safe)

```typescript
class OrchestratorClient {
  constructor(private baseUrl: string, private apiKey: string) {}

  private fetch(path: string, method: string, body?: unknown): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "x-user-id": "my-product",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async createProject(opts: {
    image: string;
    env?: Record<string, string>;
    backend?: { type: string; authMode?: string; authFiles?: { path: string; content: string; mode?: number }[] };
  }) {
    const projectRef = `sandbox-${crypto.randomUUID().slice(0, 12)}`;
    const res = await this.fetch("/projects", "POST", {
      projectRef,
      container: { image: opts.image, env: opts.env },
      backend: opts.backend ?? { type: "claude-code" },
    });
    if (!res.ok) throw new Error(`Provision failed: ${res.status}`);
    return this.parseProject(await res.json());
  }

  async getProject(projectRef: string) {
    const res = await this.fetch(`/projects/${projectRef}`, "GET");
    if (!res.ok) throw new Error(`Not found: ${res.status}`);
    return this.parseProject(await res.json());
  }

  async deleteProject(projectRef: string) {
    await this.fetch(`/projects/${projectRef}`, "DELETE");
  }

  async registerSessionMapping(sessionId: string, userId: string, sandboxId: string) {
    await this.fetch(`/v1/session/${sessionId}/mapping`, "PUT", { userId, sandboxId });
  }

  async waitForRunning(projectRef: string, timeoutMs = 120_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const info = await this.getProject(projectRef);
      if (info.status === "running") return info;
      if (info.status === "failed") throw new Error(`Container failed: ${info.error}`);
      await new Promise((r) => setTimeout(r, 2_000));
    }
    throw new Error("Timeout waiting for container");
  }

  private parseProject(data: any) {
    const project = data.project ?? data;
    const conn = project.connection ?? {};
    const statusMap: Record<string, string> = {
      provisioning: "provisioning", ready: "running", running: "running",
      degraded: "running", suspended: "stopped", stopped: "stopped", failed: "failed",
    };
    return {
      projectRef: project.projectRef ?? project.id,
      status: statusMap[project.status] ?? project.status,
      sidecarUrl: conn.sidecarUrl as string | undefined,
      authToken: conn.authToken as string | undefined,
      error: project.error as string | undefined,
    };
  }
}
```

### Sidecar HTTP Client (Worker-safe)

Once you have the sidecar URL from `getProject()`, call it directly:

```typescript
class SidecarClient {
  constructor(private url: string, private token: string) {}

  private fetch(path: string, method: string, body?: unknown): Promise<Response> {
    return fetch(`${this.url.replace(/\/$/, "")}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}` },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  async exec(command: string, timeoutMs = 120_000) {
    const res = await this.fetch("/terminals/commands", "POST", { command, timeout: timeoutMs });
    const data = await res.json();
    const result = data.result ?? data;
    return { exitCode: result.exitCode ?? 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  }

  async writeFile(path: string, content: string, encoding: "utf8" | "base64" = "utf8") {
    await this.fetch("/files/write", "POST", { path, content, encoding });
  }

  async readFile(path: string) {
    const res = await this.fetch("/files/read", "POST", { path });
    const data = await res.json();
    return (data.data ?? data).content as string;
  }

  async prompt(message: string, opts?: { sessionId?: string; backend?: any }) {
    // Returns SSE stream — parse for result events
    const res = await this.fetch("/agents/run/stream", "POST", {
      message,
      parts: [{ type: "text", text: message }],
      ...opts,
    });
    // Parse SSE events from response body...
    return { response: "...", inputTokens: 0, outputTokens: 0 };
  }

  async snapshot(sandboxId: string, storage: any, tags?: string[]) {
    const res = await this.fetch("/snapshots", "POST", { projectId: sandboxId, storage, tags });
    const data = await res.json();
    return { snapshotId: (data.snapshot ?? data).id };
  }
}
```

### Sidecar API Reference

| Operation | Endpoint | Method | Body |
|-----------|----------|--------|------|
| Execute command | `/terminals/commands` | POST | `{ command, timeout?, cwd?, env? }` |
| Write file | `/files/write` | POST | `{ path, content, encoding? }` |
| Read file | `/files/read` | POST | `{ path, encoding? }` |
| Stream prompt | `/agents/run/stream` | POST | `{ message, parts, sessionId?, backend? }` |
| Create snapshot | `/snapshots` | POST | `{ projectId, storage, tags? }` |

### When to Use SDK vs Direct API

| | SDK (`@tangle-network/sandbox`) | Direct Orchestrator API |
|---|---|---|
| **Best for** | Node.js servers, scripts, tests | Cloudflare Workers, edge runtime |
| **Dependencies** | Pulls in Node.js APIs (`fs`, `crypto`) | Zero dependencies (just `fetch`) |
| **Local dev** | Needs adapter server | Works directly with orchestrator URL |
| **File uploads** | `box.upload(localPath)` | Not available (use `writeFile` instead) |
| **Convenience** | Higher-level API | Lower-level, more control |

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

2. **No Node.js backend required.**
   Workers handle all write operations. The browser handles the read stream. If you find yourself building a Node.js intermediary, stop and use the Worker-only pattern.

3. **Backend requests must be short-lived.**
   No SSE streaming through the backend. The backend issues tokens and returns JSON. The browser holds the long WebSocket connection.

4. **Use `ctx.waitUntil()` for background work.**
   Prompt kickoff, file deployment, and async provisioning run via `ctx.waitUntil()` after the response is sent.

5. **Always register session mapping before returning token.**
   `box.registerSessionMapping()` must complete before the frontend connects, or events will be lost.

6. **Frontend reports billing.**
   The `result` event contains `tokenUsage`. The frontend POSTs this to the Worker's `/complete` endpoint for credit deduction and message persistence.

7. **Handle sandbox reconnection gracefully.**
   Sandboxes can die. Always try to reconnect by stored `projectRef` before provisioning a new one. Re-sync documents on re-provision.

8. **Token refresh is the frontend's responsibility.**
   The `onTokenExpiring` callback fires before the JWT expires. The frontend calls the backend's refresh endpoint and passes the new token back to the client.

9. **Use Cloudflare primitives for state.**
   KV for ephemeral session data, D1 for persistent data, R2 for files. Don't try to use in-memory caches or PostgreSQL connections from Workers.

10. **Use Web Crypto API for token signing in Workers.**
    `ProductTokenIssuer` requires `node:crypto`. In Workers, sign JWTs with `crypto.subtle.sign("HMAC", ...)` (Step 2b).

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
- [ ] Token signed with Web Crypto API (no `node:crypto` in Workers)
- [ ] `registerSessionMapping()` called before returning token
- [ ] Prompt kicked off via `ctx.waitUntil()` (not awaited in request handler)
- [ ] `SessionGatewayClient` handles `onTokenExpiring` with refresh callback
- [ ] Frontend reports `result` event billing data to `/complete` endpoint
- [ ] `onDisconnect` handler shows user-facing error if still streaming
- [ ] Sandbox reconnection logic (don't provision a new one every request)
- [ ] Async provisioning for new sandboxes (create → poll → ready)
- [ ] Worker request handlers complete in < 30s
- [ ] No `node:crypto`, `pg`, or Node.js-only imports in Worker code
- [ ] R2 paths scoped by userId (`${userId}/${sessionId}/${filename}`)
- [ ] Binary files use base64 encode/decode through `write()` + `exec()`
- [ ] If using direct orchestrator API: status mapping handles all states (provisioning→running→failed)
- [ ] Sidecar URL resolved fresh per request (containers can restart, URLs change)
- [ ] Toolkit/config files stored in R2, not bundled in Worker (avoids 10MB bundle limit)

## Reskinning sandbox-ui Components

### CSS Variable Architecture

sandbox-ui components use CSS custom properties with fallback defaults baked into their Tailwind arbitrary-value classes (e.g. `var(--chat-send-bg, var(--accent-surface-soft))`). Consumers override these in their app.css `:root` block. No build-time config or theme prop required.

### ChatInput Variables (0.8.x+)

**Input container:**

| Variable | Default | Controls |
|----------|---------|----------|
| `--chat-input-bg` | `var(--depth-2)` | Container background |
| `--chat-input-border` | `var(--border-default)` | Container border color |
| `--chat-input-shadow` | `var(--shadow-card)` | Container box-shadow |
| `--chat-input-focus-border` | `var(--border-accent)` | Border color on focus-within |
| `--chat-input-focus-shadow` | `var(--shadow-card)` | Box-shadow on focus-within |
| `--chat-input-py` | `0.625rem` | Vertical padding inside input area |

**Send button:**

| Variable | Default | Controls |
|----------|---------|----------|
| `--chat-send-bg` | `var(--accent-surface-soft)` | Button background (supports gradients) |
| `--chat-send-hover-bg` | `var(--accent-surface-strong)` | Button hover background |
| `--chat-send-border` | `var(--border-accent)` | Button border color |
| `--chat-send-color` | `var(--accent-text)` | Icon/text color |
| `--chat-send-radius` | `var(--radius-lg)` | Border radius |
| `--chat-send-shadow` | `none` | Box-shadow |
| `--chat-send-ring` | `var(--border-accent)` | Focus-visible ring color |

### ChatMessage Variables

| Variable | Default | Controls |
|----------|---------|----------|
| `--chat-message-px` | `0.875rem` | Horizontal padding inside bubble |
| `--chat-message-py` | `0.5rem` | Vertical padding inside bubble |
| `--depth-2` | theme-dependent | Assistant message bubble background |
| `--depth-3` | theme-dependent | User message bubble background |
| `--radius-lg` | theme-dependent | Bubble border radius |
| `--border-accent` | theme-dependent | User bubble border color |
| `--border-subtle` | theme-dependent | Assistant bubble border color |
| `--chat-label-size` | `11px` | Role label font size |
| `--chat-label-weight` | `600` | Role label font weight |
| `--chat-label-tracking` | `0.14em` | Role label letter-spacing |

### Critical: Tailwind v4 + node_modules

Tailwind v4 with `@tailwindcss/vite` does NOT scan `node_modules`. sandbox-ui components use arbitrary Tailwind classes like `[background:var(--chat-send-bg,...)]` in their JSX. If sandbox-ui's bundled `styles.css` doesn't already include these classes, the consumer must manually write the CSS rules:

```css
.\[background\:var\(--chat-input-bg\,var\(--depth-2\)\)\] {
  background: var(--chat-input-bg, var(--depth-2));
}
.\[background\:var\(--chat-send-bg\,var\(--accent-surface-soft\)\)\] {
  background: var(--chat-send-bg, var(--accent-surface-soft));
}
.hover\:\[background\:var\(--chat-send-hover-bg\,var\(--accent-surface-strong\)\)\]:hover {
  background: var(--chat-send-hover-bg, var(--accent-surface-strong));
}
```

**Gradient gotcha:** `bg-[var(...)]` compiles to `background-color`, which ignores gradients. sandbox-ui uses `[background:var(...)]` (shorthand) so gradient values work. If you add custom rules, use `background:` not `background-color:`.

The consumer can also use `@source "../node_modules/@tangle-network/sandbox-ui/dist"` in their CSS to tell Tailwind to scan the dist output, but this only works if the classes survive the build pipeline.

### Prop-based Customization

**ChatInput props:**

| Prop | Default | Purpose |
|------|---------|---------|
| `inputLabel` | `"Agent Command Deck"` | Header label above textarea. Pass `null` to hide. |
| `idleStatus` | `"Ready for next instruction"` | Status text when idle. Pass `null` to hide. |
| `streamingStatus` | `"Streaming response"` | Status text during streaming. Pass `null` to hide. |
| `hideShortcutHint` | `false` | Hide the keyboard shortcut hint in footer |

**ChatMessage props:**

| Prop | Default | Purpose |
|------|---------|---------|
| `hideRoleLabel` | `false` | Hide the "YOU" / "AGENT" label |
| `hideAvatar` | `false` | Hide the avatar icon |
| `avatar` | built-in User/Bot icons | Custom `ReactNode` for avatar |
| `userLabel` | `"You"` | Label text for user messages |
| `assistantLabel` | `"Agent"` | Label text for assistant messages |

### Example: GTM Agent Theme

GTM Agent reskins the default dark sandbox theme to a light neutral palette with purple accent. The key overrides in `app.css`:

```css
:root,
[data-sandbox-ui],
[data-sandbox-theme="consumer"] {
  /* ── Surfaces: light neutral ── */
  --bg-root: #FAFAFA;
  --bg-card: #FFFFFF;
  --bg-section: #FAFAFA;
  --bg-input: #F5F5F5;
  --bg-hover: #F0F0F0;

  /* ── Depth scale: light grays ── */
  --depth-1: #FAFAFA;
  --depth-2: #F5F5F5;
  --depth-3: #EBEBEB;
  --depth-4: #E0E0E0;

  /* ── Brand: purple accent ── */
  --brand-primary: #6C5CE7;
  --accent-text: #6C5CE7;
  --accent-surface-soft: rgba(108, 92, 231, 0.04);
  --accent-surface-strong: rgba(108, 92, 231, 0.08);
  --border-accent: rgba(108, 92, 231, 0.2);

  /* ── Radii: generous ── */
  --radius-lg: 14px;
  --radius-xl: 20px;

  /* ── Chat input: white card with glow ── */
  --chat-input-py: 0.75rem;
  --chat-input-bg: var(--bg-card);
  --chat-input-border: var(--border-default);
  --chat-input-shadow: 0 2px 12px rgba(0, 0, 0, 0.06);
  --chat-input-focus-border: rgba(108, 92, 231, 0.4);
  --chat-input-focus-shadow: 0 0 0 3px rgba(108, 92, 231, 0.08),
    0 4px 20px rgba(108, 92, 231, 0.1);

  /* ── Send button: gradient purple ── */
  --chat-send-bg: linear-gradient(135deg, #6C5CE7, #a29bfe);
  --chat-send-hover-bg: linear-gradient(135deg, #5A4BD6, #6C5CE7);
  --chat-send-border: transparent;
  --chat-send-color: #FFFFFF;
  --chat-send-radius: 12px;
  --chat-send-shadow: 0 2px 8px rgba(108, 92, 231, 0.2);
  --chat-send-ring: rgba(108, 92, 231, 0.4);

  /* ── Chat message density ── */
  --chat-message-px: 1rem;
  --chat-message-py: 0.875rem;
}

/* Scoped overrides for the chat thread view */
.chat-thread-view {
  --radius-lg: 16px;
  --depth-3: rgba(108, 92, 231, 0.06);  /* user bubbles: purple tint */
  --depth-2: #FFFFFF;                     /* assistant bubbles: white */
  --accent-surface-soft: rgba(108, 92, 231, 0.08);
}
```

The manual Tailwind class rules are also required (see the Tailwind v4 section above). GTM Agent includes all three in its `app.css`.
