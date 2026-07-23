# Server-authoritative billing

The browser is user-controlled. A genuine gateway event rendered in a browser
does not make a later browser POST trustworthy.

Use one authoritative source:

1. a signed platform completion callback containing execution ID and usage;
2. a server-side execution/result query keyed by execution ID; or
3. a trusted backend consumer of the runtime result stream.

Persist an immutable usage event with provider/model, input/output/cache tokens,
cost, execution ID, tenant, application session, and turn ID. Put a unique
constraint on execution/charge identity so callback retries debit once.

Recommended completion flow:

```text
browser observes terminal event
  -> browser requests refresh of server-owned turn status
  -> server queries/verifies authoritative execution result
  -> transaction inserts usage event if absent
  -> transaction appends credit ledger debit and assistant message
  -> server returns charged amount and remaining balance
```

Never accept browser-provided model or token counts for charging. If immediate
authoritative usage is unavailable, mark the turn `pending_reconciliation` and
reserve a bounded amount rather than trusting zero.

Test duplicate callbacks, forged low usage, wrong tenant/session, failed model
runs, missing terminal usage, and reconciliation after a Worker restart.
