---
name: upgrade-agent-fleet
description: "Upgrade a FLEET of Tangle agent products (tax, gtm, legal, creative, agent-builder) to the current shell standard — adopt @tangle-network/agent-app, delete hand-rolled shell duplication, strip fork-inherited domain residue, and contribute generic improvements DOWN to the substrate. Runs as a dynamic workflow fanout with adversarial completion gates that make a false 'done' fail. Loops per agent until measurable completion criteria pass. Use when one product (the reference) has advanced past the others and the fleet must catch up, or to audit fleet drift."
---

# Upgrade Agent Fleet — adversarial, looped, fanned-out

You have N agent products that forked from a common substrate and **drifted**. One
of them (the **reference**) has advanced: it adopted a shared shell, deleted its
duplicated plumbing, fixed bugs, sharpened its domain. The others lag — each still
hand-rolls the same shell, and some still carry **residue from whatever they
forked FROM**. This skill drags the whole fleet up to the reference standard, in
parallel, and refuses to believe "done" until it's proven.

It is **only the fleet-orchestration layer.** The per-agent "how to adopt
agent-app" already exists — this skill does NOT re-specify it. It calls these as
its payload:

| Layer | Skill | Role | This skill duplicates it? |
|---|---|---|---|
| **This skill** | `upgrade-agent-fleet` | Fanout + adversarial gates + loop-until-green across many agents at once | — |
| **Per-agent adoption (the payload)** | **`build-agent-app`** | How ONE product adopts agent-app: discovery interview, module seams, layering rule, sandbox/non-sandbox wiring, the migration lift-loop, anti-patterns | **NO — delegate to it** |
| Eval-stack pipeline | `agent-stack-adoption` / `agent-eval-adoption` | The 9-phase self-improving stack + primitive reference | NO |
| Publishing improvements | `substrate-release` | Contribute-down + fleet propagation when the upgrade surfaces a generic fix | NO |

> If you're upgrading **one** agent, you don't need this skill — use `build-agent-app` directly. Reach for this only when you're moving the **fleet** and want parallelism + adversarial completion-gating + loop-until-green. Everything below is the orchestration *around* `build-agent-app`, not a second copy of it.

## The current job (instantiate these via `args` before running)

- **Reference (the standard to match):** the product furthest along on the shell — fully delegating its shell mechanism, fork residue removed. Pass it as `args.reference`.
- **Shell target:** `@tangle-network/agent-app` (published, provenance-signed). Its modules (`/tools /runtime /eval /knowledge /knowledge-loop /config /preset-cloudflare /integrations /tangle /billing /delegation /crypto /web /redact /stream`) are what a product otherwise hand-rolls.
- **Fleet to upgrade:** the remaining agent products, passed as `args.agents`. Nothing here hard-codes a repo name — the orchestration is repo-agnostic.

## The three hard-won laws (this skill exists because these were learned the expensive way)

1. **DISCOVER before you upgrade — you cannot pre-script it.** Each agent NAMES the same mechanism differently. Grepping the reference's vocabulary (`streamAppToolLoop`, `submit_proposal`, `HubExecClient`) across a target returns **zero** — not because the duplication is absent but because it's there under a different name. Every upgrade starts with a per-agent discovery pass that maps *that agent's* shell surface onto agent-app's modules. A pre-written checklist of symbol names is a lie.

2. **A fork carries the donor domain's whole layer — hunt the residue.** A product that was forked from another agent silently keeps the *donor's* live knowledge-gate (a `buildXKnowledgeRequirements` wired into the production chat loop), its whole flow library, its schema tables, and a donor-shaped eval harness — all under the new product's branding. The upgrade is not done when the shell is adopted; it's done when **no foreign-domain code remains**. Probe: `grep -rinE "<donor-domain tokens>"` (the caller passes the donor's vocabulary via `args.donorDomainTokens`, e.g. a filings/contracts donor: `matter|filing|jurisdiction|incorporation|contract`). Treat every hit as residue until proven domain-correct.

3. **Extend the substrate, never re-duplicate it.** If the upgrade reveals a generic mechanism still hand-rolled, the fix is to contribute it DOWN to `agent-app` / the engine (additive subpath, peer-dep), then have the agent consume it — not to copy the reference's local copy. Engine = `peerDependency`, never bundled. (`substrate-release` owns the publish.)

## Architecture — dynamic fanout, per-agent loop-until-green

```
fleet ─┬─ agent A ─► [Discover] ─► [Upgrade] ─► [Adversarial Verify] ─┐
       ├─ agent B ─► [Discover] ─► [Upgrade] ─► [Adversarial Verify] ─┤── loop until
       └─ agent C ─► [Discover] ─► [Upgrade] ─► [Adversarial Verify] ─┘   verdict=PASS
                                        ▲                  │
                                        └── refutations ───┘  (reopen with the
                                                                refutation as the
                                                                next task)
```

- **Fanout** across agents (parallel; each agent independent).
- **Per agent**, a bounded retry loop: `Upgrade → Verify`; if the adversarial panel refutes, feed the refutations back as the next Upgrade's directive. Stop when the panel returns a clean verdict K rounds running, or a retry cap is hit (and then `log()` the agent as NOT complete — never silently pass).
- **Isolation:** each agent runs in its own git worktree (`isolation: 'worktree'`) off its current branch. **Never push, never touch main.** The output is a verified worktree + a report; a human merges.

## Per-agent procedure — DELEGATE to `build-agent-app`

The per-agent upgrade IS the `build-agent-app` migration path — discovery interview,
module seams, the layering rule, the lift-loop, sandbox/non-sandbox wiring,
anti-patterns. **Do not restate it here.** Every Upgrade agent this skill spawns is
told to *follow `build-agent-app`* for the actual adoption. This skill adds exactly
two things on top of that procedure, because they're fleet- and rigor-specific:

- **Delta A — hunt foreign-domain residue (law 2).** `build-agent-app` covers adopting the shell; it does not assume the agent is a *fork carrying another domain's whole layer*. This skill makes residue-stripping a first-class, separately-verified step (the `domain` skeptic). [Upstream candidate: fold this into `build-agent-app`'s migration section.]
- **Delta B — measurable completion criteria + an adversarial panel** (below) instead of self-assessed "done." This is the whole point of running the fleet through a workflow rather than by hand.

## USER STORIES — validate behavior, not just compilation

Each agent must satisfy these (verified by a real test or a runtime trace, not by assertion). Phrase them per the agent's domain; the mechanism is shared:

- **Proposal routing:** "As a user, when the agent recommends a regulated action, it emits a validated `submit_proposal` tool call (via agent-app `/tools`) that lands in the approval queue with the correct taxonomy — not a fenced-text block, not a direct side effect."
- **Bounded tool loop:** "As a user, a turn that triggers integration tool calls runs the agent-app `/runtime` loop: streams a turn → executes tools → folds results → re-runs, capped at `maxToolTurns` — and the same loop drives both the sandboxed and (if applicable) browser path."
- **Integration invoke:** "As a user, a read action executes immediately through the hub client (`/integrations`); a write returns approval-required and surfaces as a proposal."
- **No foreign domain:** "As a user of *this* agent, nothing in the product references the donor domain — no foreign flows in the UI, no foreign tables queried, no foreign knowledge requirements gating my chat."
- **Eval parity:** "The eval harness runs through agent-app `/eval` re-exporting the engine verifier; the agent's completion gate scores its own domain, not the donor's."

The implementer writes/keeps a test per story. A story with no executable check is not validated.

## COMPLETION CRITERIA — measurable, per agent (the gate)

A target is **complete** only when ALL hold, each PROVEN by command output:

| # | Criterion | Proof |
|---|---|---|
| 1 | typecheck clean | `pnpm typecheck` exit 0, zero errors |
| 2 | tests ≥ baseline | `pnpm test` pass count ≥ the pre-upgrade baseline (record both) |
| 3 | build green | `pnpm build` exit 0 |
| 4 | agent-app adopted | `@tangle-network/agent-app` resolves in the lockfile; imported in ≥1 file per swapped module |
| 5 | no duplication | each swapped local module is a re-export/deleted — `grep` finds no second copy of the lifted logic |
| 6 | no foreign domain | donor-domain token probe returns 0 hits in `src/` (or every hit is justified in the report) |
| 7 | no shims/regressions | no `@ts-expect-error`, no `.skip` added, no `--no-verify`, no fake fallback introduced by the upgrade |
| 8 | LOC down | net `.server`/`src` shell LOC strictly decreased (record delta) |

Criteria are **literals checked by the verifier agents**, not vibes. "Mostly done" is FAIL.

## ADVERSARIAL VERIFICATION — designed so false "done" cannot survive

After each Upgrade, spawn a **panel of skeptics**, each with a DISTINCT refutation lens, each prompted *"default to REFUTED unless you can prove otherwise by running/grepping; cite the command and its output."*

| Lens | Tries to prove |
|---|---|
| **Build skeptic** | typecheck/test/build actually fail, or the test baseline dropped |
| **Shim skeptic** | the "deletion" is actually a second copy / a re-export that still pulls local logic |
| **Resolution skeptic** | the adoption is HOLLOW — `git grep -c "<shell>" -- src/` is 0 (or didn't rise ~per-swapped-module) despite adoption-named commits; or `<shell>` is only an array entry (e.g. `minimumReleaseAgeExclude`) not a *versioned* dependency; or imports resolve to a local path / the lockfile never moved. **Commit messages are not evidence — the real import count is.** (Caught live: an agent shipped 5 "delegate to the shell" commits with 0 actual imports.) |
| **Domain skeptic** | foreign-domain residue remains (tokens, tables, flows, knowledge gates, UI) |
| **Story skeptic** | a user story has no executable check, or its check is trivially true |
| **Silent-cap skeptic** | the upgrade narrowed scope (skipped a module, sampled, TODO'd) without saying so |

**Verdict rule:** complete only if **every** lens fails to refute (or ≥ a strong majority, with the holdouts' objections resolved). Any surviving refutation becomes the directive for the next Upgrade iteration. **Loop-until-dry:** require **2 consecutive clean panels** before declaring an agent done — a single clean pass is not enough (the tail is where the lie hides).

Cap the loop (e.g. 4 Upgrade↔Verify rounds). On cap, the agent is reported **INCOMPLETE with the open refutations** — never upgraded to "done." Silent truncation reads as success when it isn't.

## How to run

The executable form is `workflows/upgrade-agent-fleet.workflow.js` in this plugin. Invoke the **Workflow** tool with that script (or paste it), passing the fleet as `args`:

```
Workflow({ scriptPath: ".../upgrade-agent-fleet.workflow.js",
           args: { reference: "<reference-product>",
                   shell: "@tangle-network/agent-app",
                   donorDomainTokens: { "<forked-product>": ["matter","filing","jurisdiction","incorporation","contract"] },
                   agents: ["<product-a>","<product-b>","<product-c>"],
                   codeRoot: "<your code root>",
                   maxRounds: 4 } })
```

It fans out, loops each agent to a clean adversarial verdict, isolates each in a worktree, and returns a per-agent report (baseline vs final test counts, LOC delta, modules swapped, residue removed, upstream candidates, open refutations if capped). **It does not push.** Read the report, then merge the green worktrees and run `substrate-release` for any upstream candidates.

## When the fan-out stalls on one hard module — switch to a focused subagent

The adversarial fan-out is excellent at **audit, breadth, and catching hollow/partial adoption** (the coverage + shim + hollow skeptics earned their keep — they caught a forked `redact` traversal line-for-line and repeatedly flagged a capability-token-only `tools` claim). It is **bad at landing one deep, single-module surgery**: a finish agent given many modules will do the easy ones and keep skipping the hard one (e.g. migrating a `:::proposal` regex parser onto `/tools` across the chat pipeline + MCP + HTTP routes), and seeding the gap as a prior-refutation does **not** reliably force it.

**Rule:** if two finish rounds leave the *same* module unadopted (verified by import count, not the agent's self-report), stop re-fanning. Hand that one module to a **single focused subagent** with a precise brief + the reference consumer to copy + hard grep-based gates — the deterministic path. (Proven repeatedly: a deep schema/flow de-wire and a `tools` side-channel migration both landed clean via a focused subagent after the fan-out loop stalled on them.) Then re-audit.

**Always verify with the repo's ACTUAL layout.** A `git grep -- src` returns 0 on a monorepo (`packages/*/src`, `apps/*/src`) and you will wrongly call a real adoption "hollow." Grep the whole worktree, or detect the layout first.

## Safety / guardrails
- Worktree isolation per agent; **no push, no force, no main mutation, no `--no-verify`**.
- Each agent's pre-existing uncommitted work + feature branch is respected — the worktree forks the current HEAD.
- Bounded retries; capped agents are reported incomplete, not faked.
- Engines stay peer-deps; never bundle. Improvements go DOWN, not sideways.
