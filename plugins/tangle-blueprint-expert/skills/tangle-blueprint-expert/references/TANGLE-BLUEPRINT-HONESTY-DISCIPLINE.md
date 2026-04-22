# Tangle Blueprint Honesty Discipline

The companion to the build process. The build process ensures a
blueprint **compiles, runs, and validates**. This discipline ensures a
blueprint **does what it claims and nothing more**. Every blueprint
accumulates aspirational claims — in READMEs, docs, comments, tests —
and ships with some of them unsupported by code. The discipline below
makes that gap explicit, bounded, and catchable before merge.

Read after [TANGLE-BLUEPRINT-BUILD-PROCESS.md](./TANGLE-BLUEPRINT-BUILD-PROCESS.md)
and before opening a PR.

## Trigger

Apply when any of the following is shipped in the same generation:
- A new doc claim in `README.md`, `docs/*.md`, or a code comment
- A new `SettlementAdapter` / `AuthMethod` / crypto primitive / storage
  backend / "distributed" / "production-ready" / "multi-operator" claim
- A stub, placeholder, `todo!()`, `unimplemented!()`, silent fallback,
  or trait impl that returns defaults
- Any feature labeled "complete" or "done" by the author

If none of the above apply, this discipline is overhead — skip it.

## Core Contract (Never Violate)

1. **Every claim has a test or a limit.** A claim in docs is either
   covered by a test that would fail without the code, or listed in
   `docs/LIMITS.md` with the reason it is not yet covered.
2. **Every stub fails loud.** No silent defaults. No trait impl that
   passes tests without doing the work. Stubs use `todo!()`,
   `unimplemented!()`, or return an explicit `Err(NotYetImplemented)`.
3. **Every "deferred" has a named owner or trigger.** `LIMITS.md`
   entries name who owns the follow-up or what event would trigger
   it. "TODO: later" is banned.
4. **Every security-adjacent default is the paranoid one.** Asymmetric
   over symmetric. Authenticated over plaintext. Bounded over
   unbounded. The ergonomic primitive is opt-in, not default.

If any of the above is violated, the blueprint is not production-ready
regardless of what the tests say.

## The LIMITS.md Pattern

Every blueprint ships a `docs/LIMITS.md`. It is a counterweight to
every claim in `README.md` and `docs/`. The author writes it **after**
writing the claim, **before** merging the code. Reviewers block merge
if a claim has no corresponding LIMITS entry.

### Entry shape

```markdown
## <Claim that the code does NOT fully support>

**What the code actually does today:** <one sentence>

**Gap to the claim:** <specific behavior or threat that is not covered>

**Owner / trigger:** <name of person, issue, or event that would close
  this gap — never "TODO" or "eventually">

**Blast radius if gap is exercised:** <one sentence — what breaks,
  who notices, how bad>
```

### Example entries

```markdown
## "Multi-operator BFT consensus"

What the code actually does today: 3-node inline test exercises raft
quorum in-process; never run across separate OS processes or hosts.

Gap to the claim: "BFT" implies byzantine fault tolerance; the raft
implementation tolerates crashes but not byzantine behavior. Multi-
host deployment is unverified.

Owner / trigger: @drew — closes when DEPLOYMENT-RUN.md records a
≥5-node deployment with leader-kill recovery timing.

Blast radius if gap is exercised: operator churn or adversarial
operator behavior may produce inconsistent state with no detection
path.
```

```markdown
## "JWT-based customer auth"

What the code actually does today: HS256 symmetric validation by
default; RS256 and ES256 supported if configured.

Gap to the claim: HS256 means any operator with `WORKSPACE_JWT_SECRET`
can forge admin tokens for any workspace on that operator.

Owner / trigger: close by flipping default to RS256 and requiring
`BLUEPRINT_ALLOW_HS256=1` env var to enable legacy mode.

Blast radius if gap is exercised: full workspace takeover from a
single leaked operator secret.
```

### Minimum count

A non-trivial blueprint should have **≥10 LIMITS entries** by the time
it hits `v0.1`. If a PR adds a new capability (job, auth method, storage
backend), it adds at least one LIMITS entry — either for the new
capability or for an adjacent one the new capability now overclaims.

A blueprint with ≤3 LIMITS entries is either not shipping real
capabilities or not being honest about them.

## The Claim-With-Counterweight Rule

Every capability claim in `README.md` and `docs/` ships paired with a
specific limit in `LIMITS.md`. Enforced at PR review time.

### Pairs that must exist together

| Claim in README/docs | Required LIMITS counterweight |
|---|---|
| "Distributed" / "multi-operator" | Scale limit: what N has actually been tested |
| "Production-ready" | Runtime limit: what ops story exists at 3am |
| "Encrypted at rest" | Key-lifecycle limit: rotation / compromise blast radius |
| "Authenticated" | Auth primitive: symmetric vs asymmetric default |
| "Durable" | Durability primitive: fsync / replication / backup |
| "X× cheaper than Y" | Apples-to-apples scope of the comparison |
| "Proof of storage" | What exactly the proof proves (possession vs retrievability) |
| "Escrow" / "payment" | Settlement path: on-chain vs off-chain vs stub |

If the claim ships without the counterweight, the README is dishonest
by omission. Reviewers reject.

## Pre-Complete Gate (Blocks "Done")

Before declaring a feature, job, or generation complete, the author
answers all five questions. If any answer is NO, the feature is not
complete; fix first.

1. **Test:** Does every new claim in docs have a test that would FAIL
   without the code?
2. **Crypto:** Does every new crypto operation have an explicit
   key-lifecycle entry in `LIMITS.md` (rotation, segregation, blast
   radius)?
3. **Distributed:** Does every new "distributed" / "multi-operator" /
   "replicated" claim have a test with ≥2 separate OS processes on
   distinct ports?
4. **Deferred:** Does every new "deferred," "later," or `todo!()` have
   a named owner or trigger event in `LIMITS.md`?
5. **Deploy:** Does `scripts/deploy-local.sh` (or equivalent) still
   run end-to-end after this change?

This gate is the counter to premature-complete, which is the single
most common failure class observed in multi-turn blueprint sessions.

## Paranoid-Default Rule for Security-Adjacent Code

When adding auth, crypto, storage, HTTP, or network primitives, the
default configuration is the paranoid primitive. The ergonomic
primitive is opt-in via explicit env var or builder call.

### Concrete defaults

| Surface | Paranoid default | Ergonomic opt-in |
|---|---|---|
| JWT signing | RS256 or ES256 | HS256 via `BLUEPRINT_ALLOW_HS256=1` |
| Storage encryption | AES-256-GCM + HKDF per-tenant | Plaintext via `BLUEPRINT_ALLOW_PLAINTEXT_STORAGE=1` |
| Inter-operator auth | Separate HMAC key, not the JWT secret | Reuse only via explicit builder call |
| HTTPS | Required for presigned URLs, callbacks, peers | `http://` via `BLUEPRINT_ALLOW_INSECURE_URLS=1` |
| Session expiry | Explicit `exp` claim, ≤24h default | Longer via explicit builder call |
| Capability scope | Narrow (per-workspace, per-job) | Broad via explicit scope list |

Code that ships with an ergonomic default for security-adjacent
surfaces is the most common class of blueprint bug observed in
post-mortem reviews. Reviewers block.

## Stub Discipline

A stub is code that claims to implement an interface but does not do
the work. Every blueprint has some; they are unavoidable when an
interface outpaces what the chain, a partner service, or a spec can
actually deliver yet. The discipline below keeps stubs honest.

### Acceptable stubs

1. **Explicit panic**: `todo!()`, `unimplemented!("<reason>")`
2. **Explicit error**: `return Err(BlueprintError::NotYetImplemented(...))`
3. **Explicit logged no-op** with a warning that fires on every call
4. **Feature-gated missing impl** that won't compile without the gate

### Unacceptable stubs

1. Trait impl that returns default values silently
2. Function that logs once at startup then no-ops forever
3. `if false { ... }` blocks or commented-out code paths
4. Mock values that look real in tests (e.g. `settlement_id: "ok"`)

A stub that lets tests pass silently is worse than no stub. Any test
asserting behavior of stubbed code must either (a) assert the explicit
stub error/panic, or (b) be marked `#[ignore]` with a linked issue.

## Anti-Patterns (Block on Any)

1. **`"X-killer"` framing** in README. Every claim of the form
   "10× faster than Y" requires a dedicated section in `LIMITS.md`
   stating the apples-to-apples comparison scope.
2. **"Production-ready" in README before a real deployment number.**
   `docs/DEPLOYMENT-RUN.md` (or equivalent) must cite specific numbers
   from a specific run with a specific commit SHA.
3. **Tests that use `.toBeDefined()` / `assert!(result.is_ok())`** as
   the only assertion. Assert the shape of the result, not its
   existence.
4. **Security-adjacent code defaulting to the ergonomic primitive**
   (see paranoid-default rule above).
5. **"Deferred" / "TODO: later" / "known limitation" in code comments
   without a matching LIMITS.md entry.** Comments rot; LIMITS.md is
   canonical.
6. **Stubs that pass tests silently** (see stub discipline above).
7. **Premature "complete" / "done"** without the pre-complete gate
   passing.
8. **Mock at internal seams.** Mocks belong only at external process
   boundaries (chain RPC, S3, external APIs). Never mock a trait the
   blueprint itself defines.

## Relationship to the 5-Phase Build Process

This discipline **augments**, not replaces, the build process:

| Build Phase | Honesty addition |
|---|---|
| Phase 0 (Alignment) | Build Contract names the claims that will be made + the LIMITS entries they require |
| Phase 2 (Implementation) | Every capability commit adds a LIMITS entry; paranoid defaults applied to security-adjacent code |
| Phase 3 (Validation gate) | Pre-complete gate runs before declaring done; stub discipline audited |
| Phase 3.5 (Adversarial pass, new — see meta-review ref) | Skeptic + security sub-agents review the diff |
| Phase 4 (PR) | PR description cites the new LIMITS entries as evidence of honesty discipline |
| Phase 5 (Learning loop) | Learning entry records any claim-vs-code gap that was caught late |

The build process proves the blueprint works. The honesty discipline
proves the blueprint is being described accurately. Both are required
for production-ready; neither is sufficient alone.

## Source

Extracted from a post-session meta-review of a multi-generational
blueprint buildout that produced ~9,000 LOC of Rust across 8
generations. The pattern observed: every generation had one claim
that outran its code by the end. The LIMITS.md discipline was the
cheapest catch; the pre-complete gate was the earliest catch; the
paranoid-default rule was the safest catch. Applied together, they
compressed the "code → honest description of code" gap from
post-merge to pre-merge.

See also: [TANGLE-BLUEPRINT-META-REVIEW.md](./TANGLE-BLUEPRINT-META-REVIEW.md)
for the continuous-adversarial and persona-dispatch patterns that
find what this discipline misses.
