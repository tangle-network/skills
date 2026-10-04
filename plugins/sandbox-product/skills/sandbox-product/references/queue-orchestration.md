# Queue-Based Orchestration Pattern

For products where a CF Worker (or edge function) orchestrates sandbox work via queues,
and the sandbox runs independently — no browser streaming.

## When to use this instead of browser-session.md

- The product runs batch work (audits, scans, code review), not interactive chat
- Multiple parallel work units (arms, auditors, scanners) per job
- Work takes minutes to hours, exceeding any request budget
- No browser is involved — the Worker is the only orchestrator

## Architecture

```text
POST /api/jobs (2 sec)
  → create job record + fan out N unit messages to CF queue
  → each unit message = one consumer invocation

Unit executor (5 sec):
  → create sandbox → prompt(detach: true) → fire-and-forget
  → sandbox runs independently for hours (no CF limit)
  → send check message to queue

Check executor (2 sec per check, every 60s):
  → poll session.status() → running? re-check
  → completed? → session.result() → parse output → publish
  → if no structured output, send format-enforcement re-prompt (same session)

Completion (2 sec):
  → when all units have artifacts → fuse/reconcile → complete job
```

## Per-unit queue messages

Send N messages for N work units. Each gets its own consumer invocation sized
to fit the CF execution budget (~15 min).

```typescript
for (const unit of units) {
  await queue.send({ kind: 'unit', unitId: unit.id, jobId, ... })
}
```

Never put all units in one message — the consumer will exceed its budget and
the message will be redelivered, restarting everything from scratch.

## Session continuation on retry

When a unit times out and the queue redelivers, reconnect with the **same
sessionId** and the **same sandbox**. Send a short continuation prompt:

```typescript
const prompt = attempt === 0
  ? fullPrompt
  : "Continue from where you left off. Emit your output NOW."
```

The agent's conversation continues — it doesn't restart.

**Critical:** Look up the prior sandbox ID from your event log. Do NOT
provision a new sandbox on retry — the new sandbox has no session history
and the continuation prompt is useless.

## Attempt counting from D1 (not message fields)

CF queue redelivery resets message fields to their original values. Your
`attempt: 3` becomes `attempt: 0` when the consumer dies. Count attempts
from your database:

```typescript
const result = await db
  .prepare(`SELECT COUNT(*) as count FROM events WHERE job_id = ? AND unit_id = ? AND type = 'unit.started'`)
  .bind(jobId, unitId)
  .first()
const attempt = Number(result?.count ?? 0)
```

## Format enforcement

If the agent completes its session but doesn't emit the expected structured
output (JSON block, marker-delimited data), send a re-prompt in the same
session asking it to format its existing analysis:

```typescript
if (findings.length === 0 && result.response.length > 50) {
  const rePrompt = "Emit your findings NOW as a JSON block. Format: [severity, title, location]."
  const reResult = await session.prompt(rePrompt, { sessionId })
  findings = parseFindings(reResult.response)
}
```

## Completion detection

After each unit completes, check if all units have artifacts. If so, send
a fusion/completion message to the queue:

```typescript
const allDone = await Promise.all(
  units.map(async (u) => {
    const obj = await BUCKET.get(`jobs/${jobId}/units/${u.id}.json`)
    return obj !== null
  })
)
if (allDone.every(Boolean)) {
  await queue.send({ kind: 'fuse', jobId, ... })
}
```

## Idempotent reconciliation

The fusion step should wipe incremental inserts and write the final set:

```typescript
await db.prepare('DELETE FROM results WHERE job_id = ?').bind(jobId).run()
await insertResults(db, jobId, fusedResults)
```

This makes the final state exact regardless of how many partial inserts
happened during unit execution.
