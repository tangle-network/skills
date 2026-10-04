# Credential Management and Platform Health

How to handle API keys, platform keys, and service health when building on Tangle sandboxes.

## Never put API keys in environment variables visible to untrusted processes

Environment variables are inherited by ALL processes in the container, including
user code running as uid 1000. This leaked 5 API keys to every sandbox
(see agent-dev-container issue #9176).

### ✅ Correct: secure files with root-only permissions

```typescript
// Sidecar boot: read key from secure file, then scrub env
const key = readFileSync('/run/secrets/router-key', 'utf8').trim()
delete process.env.ROUTER_API_KEY  // scrub after reading

// The file has 0600 permissions, owned by root
// The untrusted process (uid 1000) cannot read it
```

### ❌ Wrong: API keys in env vars

```typescript
// Every process in the container sees this, including user code
process.env.AMP_API_KEY  // readable by uid 1000
process.env.ANTHROPIC_AUTH_TOKEN  // readable by uid 1000
```

## Platform key scoping

Tangle platform keys (`sk-tan-...`) are product-scoped:

- A key scoped to product "audits" is rejected (403) by the sandbox API
- A key scoped to product "sandbox" is rejected by the audits API
- Unscoped keys work everywhere (avoid these for customers)

When designing your product, decide which product scope your keys need and
mint accordingly via the device flow or platform API.

## Checking platform health before provisioning

Before creating sandboxes, check the platform is healthy. The most common
failure is storage exhaustion (thin pool full):

```typescript
async function checkPlatformHealth(sandboxUrl: string, apiKey: string): Promise<void> {
  const resp = await fetch(`${sandboxUrl}/v1/sandboxes`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  if (!resp.ok) throw new Error(`Sandbox platform unhealthy: ${resp.status}`)
  // Also check for storage exhaustion in error messages
}
```

Signs of storage exhaustion:
- `INVALID_WORKSPACE_PATH` error code
- `Thin pool nearly full` in error messages
- 500 on every provision attempt

If the platform is unhealthy, fail gracefully — don't retry into a wall.

## Multi-arm credential architecture

If running multiple agent arms per job, each arm's sandbox needs its own
inference credential. Options:

1. **User key pass-through**: Forward the user's platform key (bills to user)
2. **Product key**: Use the product's router key (bills to product)
3. **Per-arm keys**: Mint scoped keys per arm (most isolated)

```typescript
const backend = {
  type: 'opencode',
  model: {
    provider: 'openai-compat',
    model: 'zai/glm-5.3',
    baseUrl: 'https://router.tangle.tools/v1',
    apiKey: userKey || productKey,  // pass-through or fallback
  },
}
```

**Important:** Product-scoped user keys cannot serve the router. If the user's
key is scoped to a non-router product, fall back to the product key for
inference (the user's admission is still checked for compute).
