# Blueprint Manager (BPM) vs Blueprint Instance

The single most common architectural confusion among new blueprint
authors is mixing up what the **Blueprint Manager** (BPM) handles
automatically versus what the **Blueprint Instance** (the code the
author writes) must implement. This doc fixes that.

Read after [TANGLE-BLUEPRINT-OVERVIEW.md](./TANGLE-BLUEPRINT-OVERVIEW.md)
and before picking BSM hooks or designing billing.

## The two-layer model

```
                   Tangle Chain
                (BSM contracts, onchain events, staking, slashing)
                        ▲
                        │  watches events, emits txs
                        │
          ┌─────────────┴──────────────┐
          │   Blueprint Manager (BPM)  │   Runs on every operator.
          │   SDK-provided, not code   │   Provided by blueprint-sdk.
          │   you write.               │   Config: harness.toml + BSM
          └─────────────┬──────────────┘
                        │  provisions, kills, pauses, routes events
                        │
          ┌─────────────┴──────────────┐
          │   Blueprint Instance       │   Runs per customer request.
          │   Your code.               │   Jobs + Operator API + state.
          └────────────────────────────┘
```

**BPM is not a library you integrate with.** It's a process the
SDK spins up for every operator, responsible for everything at the
protocol layer. The blueprint author configures it declaratively
via BSM hooks + `harness.toml` and otherwise leaves it alone.

**Blueprint Instance is what the author writes.** It runs inside a
sandbox BPM provisions for a specific service request. It does
business logic — it does not talk to the chain directly.

## What BPM handles (author does not write)

Protocol-layer concerns. All of these are free once BSM hooks are
configured correctly.

| BPM responsibility | Triggered by | Author action required |
|---|---|---|
| Operator registration | onchain `OperatorRegistered` event | Extend `BlueprintServiceManagerBase`; BPM reads hooks |
| Service request approval flow | onchain `ServiceRequested` event | Override `onRequest` BSM hook if custom policy needed |
| Instance provisioning | post-approval | Configure sandbox template via `harness.toml` |
| Instance lifecycle (start/stop/kill/upgrade) | BPM internal state machine | None |
| PAY_ONCE settlement | approval time | Pick `PAY_ONCE` in BSM payment config |
| SUBSCRIPTION renewal | onchain `SubscriptionRenewed` event | Pick `SUBSCRIPTION` in BSM; set renewal interval |
| EVENT_DRIVEN payment settlement | onchain event the author registers | Emit the trigger event from instance |
| Slashing execution | onchain `OperatorSlashed` event | Define slash conditions in BSM; BPM enforces |
| RFQ / quote flow | onchain quote request | Override `onRequestForQuote` BSM hook |
| Bridging chain state ↔ instance | continuous | None |
| Routing customer requests to this operator | per-request | None — chain-level |

If you find yourself writing Rust code to do any of the above, **stop**
and check the BSM hooks reference first. It's almost always already
exposed.

## What the Instance handles (author writes this)

Product-layer concerns. All of these require real code.

| Instance responsibility | What it looks like |
|---|---|
| Tangle job handlers | `#[instrument]` + `CallId` + `Timestamp` extractors in Rust |
| Operator API (HTTP) | Axum router with `/healthz`, `/api/*`, session auth |
| Per-instance state | SQLite / vector store / filesystem — scoped to this instance |
| Business logic | The actual product — SQL exec, inference, scraping, etc. |
| Usage metering | Local counters for storage × time, compute × time, API calls |
| Usage reporting back to BSM | Emit the metering event BPM expects (BSM hook defines the shape) |
| Quota enforcement | Pause/reject work when BPM signals billing is out of escrow |
| Per-tenant encryption (if multi-tenant) | HKDF-derived per-tenant keys |
| Customer-facing UI glue | Routes + forms in `blueprint-ui` / `agent-ui` |

The instance does **not** talk to the Tangle chain directly. It talks
to BPM (via BSM hooks + local bridge endpoints). BPM talks to chain.

## Billing: who does what

This is the source of the most common mistake — writing instance-side
code that duplicates BPM's settlement responsibilities. Keep the split
explicit.

| Billing concern | Who handles it | How |
|---|---|---|
| Customer paid at request time? | BPM | `onRequest` + chain tx verification before provisioning |
| PAY_ONCE settlement | BPM | Chain event, no instance involvement |
| SUBSCRIPTION renewal settlement | BPM | Chain event, no instance involvement |
| EVENT_DRIVEN payment trigger | Instance emits, BPM settles | Instance emits a BSM-defined event; BPM submits tx |
| Per-instance usage tracking | Instance | Local counters (storage × time, etc.) |
| Usage reporting for metered billing | Instance → BPM | BSM hook: e.g. `reportUsage(instance_id, amount)` |
| "Customer is out of escrow, stop work" | BPM tells instance | BPM → instance pause signal; instance honors |
| Slashing (operator misbehaved) | BPM | Chain triggers, BPM enforces locally (kill instance, refund escrow) |
| Refund logic | BPM + BSM | Chain-side; instance just exits cleanly |

### The adapter anti-pattern

A new author often writes something like:

```rust
// ❌ WRONG — reinvents BPM's job
pub trait SettlementAdapter {
    fn settle(&self, amount: u128) -> Result<()>;
}
pub struct EscrowAdapter { ... }    // in-DB balance tracker
pub struct TangleNativeAdapter { }  // stub, "for when chain is ready"
```

This is almost always wrong. The correct version is:

```rust
// ✅ RIGHT — emit the event BSM expects, BPM settles
emit_bsm_event(BsmEvent::UsageReported {
    instance_id,
    amount_nano: debit,
    meter_type: "storage_byte_hours",
});
```

BPM is already watching for that event and handles settlement through
the BSM payment model you configured. No adapter trait. No in-DB
shadow ledger. No "chain-native-later" stub.

If the BSM payment primitive you need genuinely doesn't exist, that's
a protocol-level issue to raise upstream — not an instance-side
abstraction to invent.

## Lifecycle: who does what

| Lifecycle event | Who triggers | Who acts |
|---|---|---|
| Customer requests service | Chain | BPM (approves or rejects per `onRequest` hook) |
| BPM provisions instance | BPM | Spins up sandbox; runs instance binary |
| Instance boots, joins operator mesh | Instance | `main.rs` — runner wiring, peer discovery if multi-op |
| Instance accepts jobs | Chain → BPM → Instance | Job handler executes |
| Instance reports usage | Instance | Emit BSM event |
| BPM renewal: customer still paying? | Chain | BPM continues / pauses |
| Customer cancels | Chain | BPM kills instance; instance runs shutdown |
| Operator deregisters | Chain | BPM graceful drains; instance finalizes state |
| Slashing condition met | Chain | BPM enforces (kills instance, returns escrow) |

The instance's lifecycle awareness is: *boot, accept jobs, handle
graceful shutdown*. Everything else is BPM.

## The `harness.toml` interface

`harness.toml` is where the author tells BPM how to provision the
instance: container image, resource limits, required secrets, BSM
contract address, payment model choice. BPM reads this once per
provision.

What you set in `harness.toml`:
- Sandbox template (container / VM / bare process)
- Resource limits (CPU, RAM, GPU, disk)
- Required environment (secrets from BPM, operator identity)
- BSM contract reference
- Health-check policy

What you **don't** set in `harness.toml`:
- Payment logic (lives in BSM contract)
- Slash conditions (lives in BSM contract)
- Job handlers (lives in instance Rust code)
- Operator API routes (lives in instance Rust code)

## Anti-patterns

1. **Settlement adapter traits in instance code.** See above. BPM +
   BSM handle settlement. Instance emits events.
2. **Watching chain events from the instance.** The instance has no
   direct chain connection. BPM bridges events.
3. **Submitting chain transactions from the instance.** Instance emits
   BSM-defined events; BPM submits txs if needed.
4. **Per-instance escrow ledger in instance DB.** Duplicate of
   on-chain state. Read from BPM; don't shadow.
5. **Slashing logic in instance code.** Slashing is chain-enforced via
   BSM. Instance just exits cleanly on kill signal.
6. **Hand-rolled operator-registration flow.** BPM does this from the
   `OperatorRegistered` chain event.
7. **Instance-side customer-identity resolution via chain.** BPM
   passes customer identity to instance at provision time; instance
   trusts BPM.
8. **Writing code that "might eventually" talk to chain directly.**
   If you need chain behavior the SDK doesn't expose, raise a
   protocol issue — don't half-build an adapter.

## Checklist before implementing a billing model

Answer each yes or no. No = you're doing it in the wrong layer.

- [ ] Have I picked a BSM payment type (`PAY_ONCE` / `SUBSCRIPTION` /
      `EVENT_DRIVEN` / metered-usage)?
- [ ] If metered, have I identified the specific BSM hook that
      reports usage, and what event shape it expects?
- [ ] Is my instance-side code limited to *counting* usage, not
      *settling* it?
- [ ] Does the instance honor BPM's pause signal (cleanly stop work
      when escrow runs out)?
- [ ] Have I avoided inventing any `*Adapter` trait that parallels
      BSM primitives?
- [ ] Have I configured the BSM payment model in the contract (not
      in Rust)?

If any answer is no, go read
[TANGLE-BLUEPRINT-BSM-HOOKS.md](./TANGLE-BLUEPRINT-BSM-HOOKS.md) and
[TANGLE-BLUEPRINT-PRODUCTION-PATTERNS.md](./TANGLE-BLUEPRINT-PRODUCTION-PATTERNS.md)
before writing more code.

## Summary

- BPM = chain watcher + provisioner + settlement executor. Not
  code you write.
- Instance = your product. Counts usage, runs jobs, serves API.
- BSM hooks = declarative config that tells BPM how your blueprint
  bills, slashes, and lifecycles.
- When in doubt: BPM handles protocol; instance handles product.
  If you're tempted to build a "seam" between them in Rust, you're
  reinventing BPM.
