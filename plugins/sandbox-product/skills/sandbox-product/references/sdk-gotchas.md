# SDK Gotchas and Integration Contract

Hard-won facts about the `@tangle-network/sandbox` SDK that cause silent failures
if you get them wrong. Each of these cost hours of debugging.

## Result text property

The agent's response is in `result.response`, NOT `result.text`.

```typescript
// ✅ Correct
const result = await box.prompt(text, { sessionId })
console.log(result.response)  // the agent's output

// ❌ Wrong — silently returns undefined, all findings parse as empty
console.log(result.text)  // undefined
```

This caused every audit to return 0 findings until we read the SDK types carefully.

## Backend provider name

Use `'openai-compat'`, NOT `'openai'`. The sandbox runtime rejects `'openai'`
with a 400 on every agent turn.

```typescript
// ✅ Correct
backend: { type: 'opencode', model: { provider: 'openai-compat', ... } }

// ❌ Wrong — every turn 400s
backend: { type: 'opencode', model: { provider: 'openai', ... } }
```

## Model ID namespacing

Model IDs sent to the sandbox runtime must be router-namespaced:

```typescript
// ✅ Correct — router-namespaced
model: 'zai/glm-5.3'
model: 'openai/gpt-5-mini'

// ❌ Wrong — bare IDs fail
model: 'glm-5.3'
model: 'gpt-5-mini'
```

The router resolves namespaced IDs to the correct upstream provider. Bare IDs
may work for direct API calls but fail through the sandbox runtime.

## baseUrl and versioning

The SDK appends `/v1` to the baseUrl. Do not include it yourself:

```typescript
// ✅ Correct — SDK adds /v1
const client = new Sandbox({ baseUrl: 'https://sandbox.tangle.tools' })

// ❌ Wrong — double /v1
const client = new Sandbox({ baseUrl: 'https://sandbox.tangle.tools/v1' })
```

If your API URL already has `/v1`, strip it before passing to the SDK.

## Text part encoding

The SDK base64-encodes text parts for the wire. Do NOT pre-encode:

```typescript
// ✅ Correct — SDK handles encoding
await box.prompt('my prompt text')

// ❌ Wrong — double-encoded, the agent sees gibberish
await box.prompt(btoa('my prompt text'))
```

## streamPrompt and AbortController

The `streamPrompt` async generator does NOT honor AbortController during
iteration. If the stream goes silent (model thinking for minutes), your abort
signal will not fire. Use `Promise.race` against the iterator:

```typescript
const iterator = stream[Symbol.asyncIterator]()
let timedOut = false
while (!timedOut) {
  const result = await Promise.race([
    iterator.next(),
    new Promise(resolve => setTimeout(() => { timedOut = true; resolve({ done: true }) }, remaining)),
  ])
  if (result.done) break
  // process event
}
```

## Sandbox info completeness

When mocking sandbox responses in tests, the SDK requires ALL three
filesystem incarnation fields:

```typescript
{
  filesystemIncarnationId: 'inc_123',        // required
  filesystemIncarnationProvenance: 'fresh',  // must be 'fresh'|'restored'|'unknown'
  filesystemIncarnationReadiness: 'ready',   // must be 'ready'|'transitioning'
}
```

Missing any one causes all three to be nulled, and `prompt()` throws
"Filesystem incarnation is not ready."

## Sandbox lifecycle

Sandboxes auto-stop when idle. If you're reconnecting to a stopped sandbox
(session continuation on retry), call `instance.resume()` first:

```typescript
const box = await client.get(sandboxId)
if (box.status !== 'running') {
  await box.resume()
}
```

## Detached execution

`detach: true` on `prompt()` keeps the run alive after the calling process
disconnects. This is essential for fire-and-poll:

```typescript
await box.prompt(text, { sessionId, detach: true })
// The sandbox continues running even if this Worker dies
```

Without `detach`, the run is cancelled when the connection drops.
