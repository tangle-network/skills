# Tangle Blueprint Meta-Review

The review discipline that catches what linting, tests, and the
validation gate miss. Runs as a **continuous adversarial pass** during
the build (after every generation / feature commit) and as a
**persona-dispatch synthesis** before promoting to `v0.1` / mainnet.

Read after [TANGLE-BLUEPRINT-HONESTY-DISCIPLINE.md](./TANGLE-BLUEPRINT-HONESTY-DISCIPLINE.md)
and before Phase 4 (PR) for each generation, and before any "shipping
to mainnet" decision.

## Two Levels

### Continuous (per-generation, after each feature commit)

After every significant commit, dispatch adversarial sub-agents on the
diff. Fast, narrow, ≤300 words per agent. Catches issues while the
context is still live.

### Synthesis (before v0.1 / mainnet / reference-quality claim)

Dispatch 5 full persona sub-agents in parallel. Each reads the whole
repo + docs + LIMITS and produces a scored rubric + verdict. Aggregate
into a single meta-review with ranked follow-ups.

Both are additive to Phase 3 validation. Neither replaces it.

---

## Continuous Adversarial Pass (per commit)

### Trigger

Dispatch after every commit that:
- Adds a new job, auth method, storage primitive, or crypto operation
- Changes a file matching
  `auth|crypto|jwt|secret|key|hash|sign|encrypt|ipfs|s3|http|billing|settle`
- Adds a claim to `README.md` or `docs/*.md`
- Is tagged by the author as completing a feature or generation

Skip for: typo fixes, formatting, pure rename commits, dependency
bumps.

### Skeptic sub-agent prompt template

```
Adversarial review of commit <SHA> on blueprint <name>.

Input: the commit diff, the full docs/ directory, and docs/LIMITS.md.

Your job — find three specific problems:
  1. One claim in the diff or docs that the code does not actually
     support. Cite file:line.
  2. One "deferred" / "later" / "todo" that is actually "quietly
     hoping this won't come up." Cite the LIMITS.md entry and the
     code it waves away.
  3. One test that looks thorough but passes trivially (mocks the
     thing it claims to verify, asserts only truthiness, stubbed
     dependency returning defaults).

For each finding, state the day-90-production blast radius in one
sentence: what breaks, who notices, how bad.

Output: ≤300 words, no charity reading, expect to defend the
critique to the author.
```

### Security sub-agent prompt template (conditional)

Fire when the diff touches
`auth|crypto|jwt|secret|key|hash|sign|encrypt|ipfs|s3|http|tls`:

```
Security review of commit <SHA> on blueprint <name>.

Input: the commit diff, docs/LIMITS.md, and any threat-model doc
(SLASHING.md, THREAT-MODEL.md, SECURITY.md).

Your job:
  1. Identify the paranoid default that was NOT chosen. Cite the
     line where the ergonomic default was picked.
  2. Identify one attack that works against this diff today — crypto
     primitive choice, key lifecycle, authentication composition,
     replay, forgery, or insecure transport.
  3. Propose the minimum patch that closes the attack.

Output: ≤250 words. No "defense in depth" hand-waving — name the
specific primitive or code path.
```

### Handling findings

For each "day-90 blast radius = high" finding:
- **Fix before next commit**, OR
- **Accept explicitly in `docs/LIMITS.md`** with reasoning, owner, and
  trigger (per the LIMITS pattern in the honesty discipline ref)

Silent dismissal of a skeptic or security finding is an anti-pattern.
The finding either gets code or gets a LIMITS entry. No third option.

### Output location

Store per-commit findings at `research/adversarial/<short-sha>-{skeptic,security}.md`.
These accumulate over the life of the blueprint and become inputs to
the synthesis pass later.

---

## Synthesis Pass (pre-v0.1 / pre-mainnet)

### When to run

Before any of:
- Tagging `v0.1` or higher
- Promoting from testnet to mainnet
- Publishing the blueprint as a reference implementation
- Writing the "production-ready" claim in `README.md`

### Dispatch shape

Five persona sub-agents run in parallel. Each receives:
- The full repo at a specific commit SHA
- The complete `docs/` directory including `LIMITS.md`
- The accumulated `research/adversarial/` findings
- Their persona brief (below)

Each produces a scored rubric + top-3 strengths + top-3 weaknesses +
verdict. Results land at `research/judgments/0{1..5}-<persona>.md`.
A synthesis doc at `research/synthesis/meta-review.md` aggregates.

### Persona briefs

All personas use the same five common dimensions plus 1–2
persona-specific ones. Each scored 1–10 with cited evidence.

**Common rubric dimensions:**

| Dimension | What it measures |
|---|---|
| Correctness | Code does what it claims; tests verify the claims |
| Honesty | Claims in docs match shipped behavior; limits documented |
| Ambition | Magnitude of the bets taken |
| Completeness | Cohesion vs follow-up debt |
| Defensibility | Holds up under adversarial critique |

**Persona 1 — Architect.** Senior distributed-systems architect (10+
years on replicated state stores). Cares about: module boundaries,
what abstractions leak, blast radius of a bad operator, multi-tenancy
cost, maintainability by someone who didn't write the code. Persona-
specific: Abstraction Quality, Operational Soundness (what breaks at
3am, who gets paged).

**Persona 2 — Security Reviewer.** Independent auditor of DePIN /
custody / multi-operator data planes. Assumes the operator set
includes at least one malicious party, at least one operator will
leak secrets, customers are not cryptographically sophisticated.
Persona-specific: Cryptographic Soundness (primitive choice, nonce
handling, integrity), Key Lifecycle (rotation, segregation, blast
radius).

**Persona 3 — Economist / Competitive Strategist.** Former fintech
product strategist. Skeptical of "X× cheaper" claims, looks for
bundled-vs-raw cost distinctions, expects competitor moats to survive
honest comparison. Persona-specific: Price Defensibility, Market
Realism (is the ICP identified and credible).

**Persona 4 — Skeptic / Adversarial Reviewer.** Professional "show me"
voice. Assumes every "production-ready" claim is 50% aspiration,
tests exist but don't prove what's claimed, docs describe ideal-state
code not shipped-state. Persona-specific: Claim-to-Code Gap (count
unverifiable claims), Day-90 Worst Case.

**Persona 5 — Process Analyst.** Research director studying the
session that produced the code, not the code itself. Cares about
decision velocity, time-to-critique, what triggered course-
corrections, reusable distillation. Persona-specific: Pattern
Extractability, Automation Potential.

Each persona brief should also state:
- Key files / docs to read
- Anti-patterns to actively look for (e.g. `TODO`, `unwrap()`,
  `expect()`, `#[cfg(test)]` happy-paths, `toBeDefined()`-style
  assertions)
- Deliverable shape (1-sentence verdict line + scored table + top-3
  strengths + top-3 weaknesses + one counterfactual)

### Synthesis output

`research/synthesis/meta-review.md` aggregates the five judgments into:
- Aggregate score table (mean of common dimensions across personas)
- Verdict matrix (one per persona)
- Top-3 cross-persona issues (flagged by ≥3 personas independently)
- Top-3 cross-persona wins (same threshold)
- Ranked follow-ups with effort estimate and owner
- Counterfactual: a different session shape that might have scored
  higher

The synthesis verdict names a tier (see scorecard below) and must
match what a cold reader would conclude after 10 minutes with the
repo. If the verdict is overly generous, a second skeptic pass is
required before the synthesis is accepted.

---

## 10-Point Blueprint Scorecard

Evaluated at synthesis time. Each dimension passes or fails.

| # | Dimension | Pass threshold |
|---|---|---|
| 1 | Compiles | `cargo build --all-targets` clean |
| 2 | Tests | ≥20 passing, including ≥1 `BlueprintHarness` integration |
| 3 | Coverage | Every new doc claim has a failing-without-code test |
| 4 | Honesty | `LIMITS.md` has ≥10 entries each with named owner/trigger |
| 5 | Multi-node | `docs/DEPLOYMENT-RUN.md` cites a real run, OR README honestly disclaims |
| 6 | Security | No HS256 / shared-secret / plaintext defaults on security-adjacent surfaces |
| 7 | Architecture | Persona dispatch returns no 3+-persona-agreed BLOCKING issues |
| 8 | Reversibility | Every generation is a separate git commit |
| 9 | Ergonomics | `from_env()` builder + `scripts/deploy-local.sh` actually runs |
| 10 | Meta | `research/` populated by the synthesis pass |

### Tier mapping

- **10/10 — REFERENCE-IMPLEMENTATION.** Other blueprint authors are
  safe to copy the patterns. Ship as a canonical example.
- **7–9/10 — PRODUCTION-READY.** Deployable with documented caveats.
  Honesty discipline caught the gaps that would have burned customers.
- **4–6/10 — EXPERIMENTAL.** Code works; claims outrun evidence. Do
  not promote to mainnet; do not write "production-ready" in README.
- **≤3/10 — TOYLIKE.** Demo-quality. README must explicitly say so.

A blueprint's tier goes in `README.md` as a badge or first-paragraph
sentence. No silent upgrades; the tier reflects the most recent
synthesis pass.

---

## Operator-vs-Agent Division of Labor

The single highest-leverage meta-pattern observed in multi-generational
blueprint sessions. Operator time and agent time do not substitute for
each other; split the work accordingly.

### Operator-only prompts (the 10% that drive 50% of value)

Expect 5–10 of these per session. These are the leverage points.

- **Ambition-setting.** "Do N operators, real consensus, full
  replication." "Do Gen 3 and Gen 4 at once, in parallel."
- **Honesty constraints.** "Critique why this is wrong." "Write
  `LIMITS.md` as counterweight to every claim." "Rename or delete
  the stub — don't let it pass tests silently."
- **Threat-modeling catches.** "Shouldn't this be encrypted?" "If a
  single operator's secret leaks, what's the blast radius?"
- **Taste calls.** "Shy away from tiers." "Storage × time, not per-op."
- **"Is this really done?" pushback.** The single most valuable prompt
  class; catches premature-complete every time.

### Agent does without being asked

- Scaffolding, test writing, doc drafting
- Parallel research sub-agent spawns at decision points
- `LIMITS.md` drafting (operator reviews)
- Forensics + session archival
- Pre-complete gate enforcement (per honesty discipline ref)
- Continuous adversarial sub-agent dispatch (per this doc)
- Builder pattern + `from_env()` + deploy scaffolding

### Red flag

If an operator prompt is more than 3 lines of spec, the agent should
ask: "is this spec or constraint?" A spec-shaped prompt is usually
the agent's job in disguise — burning operator attention on
agent-value work.

---

## Relationship to the 5-Phase Build Process

This discipline inserts two new phases into the canonical process.

| Phase | Name | What it adds |
|---|---|---|
| -1 | Scaffold first | unchanged |
| 0 | Alignment / Build Contract | Build Contract names the claims + required LIMITS entries |
| 1 | Reference-first analysis | unchanged |
| 2 | Implementation | Continuous adversarial pass fires after each commit |
| 3 | Validation gate | Pre-complete gate must pass (honesty discipline ref) |
| **3.5** | **Adversarial pass (new)** | Skeptic + security sub-agents on every significant commit |
| 4 | PR discipline | PR cites LIMITS entries + adversarial findings addressed |
| 5 | Learning loop | `TANGLE-BLUEPRINT-LEARNINGS.md` records claim-vs-code gaps caught |
| **6** | **Meta-review synthesis (new, pre-v0.1)** | 5-persona dispatch + 10-point scorecard + `research/` written |

Phase 3.5 runs **after every feature commit**, not once at the end.
The original session that distilled this pattern ran personas only at
the end and caught critical issues post-merge that would have been
caught pre-merge with continuous dispatch.

Phase 6 runs **once per major version**, not per commit. Its output is
the reference artifact (`research/`) that downstream readers use to
judge the blueprint's fitness for their use case.

---

## Source

Distilled from a post-session review of a multi-generational blueprint
buildout where the operator explicitly requested a "meta-analysis" of
the session. The key finding: the code quality was high, but 3 of 8
generations shipped with claims that outran the tests by one specific
primitive (HS256 default, plaintext storage, stub settlement adapter).
Running persona dispatch continuously during the build — not only
once at the end — would have caught all three before merge.

See also:
- [TANGLE-BLUEPRINT-HONESTY-DISCIPLINE.md](./TANGLE-BLUEPRINT-HONESTY-DISCIPLINE.md) — LIMITS, pre-complete gate, paranoid defaults
- [TANGLE-BLUEPRINT-LEARNINGS.md](./TANGLE-BLUEPRINT-LEARNINGS.md) — per-session learning loop (Phase 5)
