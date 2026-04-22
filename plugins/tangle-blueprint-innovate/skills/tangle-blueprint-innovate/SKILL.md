---
name: tangle-blueprint-innovate
description: Idea-to-spec conversation skill for Tangle Blueprints. Takes a category interest, one-line idea, or half-built repo and produces a tight 1-page spec ready for tangle-blueprint-expert. Does market-research sub-agent fanout (GitHub / HN / Product Hunt / arxiv / Twitter), enforces multi-operator-by-default design, maps needs onto existing BSM primitives (never invents adapters), flags when to wrap mature OSS as the capability core, and applies an in-line boringness test to kill ideas that are just SaaS-with-extra-steps.
---

# Tangle Blueprint Innovate

Use this skill when the user:

- says "I want to build a Tangle blueprint but don't have an idea"
- pitches a one-line idea that needs sharpening
- has a half-built blueprint that needs a sanity check on scope /
  archetype / primitive choice
- asks "what's popular / missing / worth building" in a space
- says "innovate on X" where X is a category or capability

**Do not use this skill for execution.** Once the spec exists, hand
to `tangle-blueprint-expert` (or equivalent execution skill like
`/blueprint-factory` if installed).

## Required Reading Order

Read in order; each builds on the previous.

1. `references/INNOVATE-CATEGORIES.md` — the 28-category taxonomy and
   the intersections that are usually the best blueprint ideas
2. `references/INNOVATE-CUSTOMER-ARCHETYPES.md` — the three archetypes
   and how each forks auth / billing / UX
3. `references/INNOVATE-MULTI-OP-PATTERNS.md` — coordinator selection,
   state convergence, request routing, failure models
4. `references/INNOVATE-OSS-WRAPPING.md` — the fastest innovation
   path: wrap a mature OSS library with multi-op + BSM billing
5. `references/INNOVATE-RESEARCH-METHOD.md` — fanout prompt templates
   for the 5 research sources
6. `references/INNOVATE-BORINGNESS-TEST.md` — in-line gut-check for
   "is this just SaaS with extra tokens?"

Also required (from sibling plugin `tangle-blueprint-expert`):
- `TANGLE-BLUEPRINT-BPM-VS-INSTANCE.md` — understand what BPM gives
  you free before designing billing
- `TANGLE-BLUEPRINT-BSM-HOOKS.md` — the primitive catalog to resolve
  the spec against

## Core Contract

1. **Multi-operator is default, not an axis.** Every blueprint has a
   coherent "what happens with 3 / 10 / 50 operators" story or it is
   not a blueprint.
2. **Use BSM primitives; never invent adapters.** If you are tempted
   to write a `*Adapter` trait parallel to BSM, stop and re-read
   `BPM-VS-INSTANCE.md`. If the primitive genuinely doesn't exist,
   that's a protocol issue — not code.
3. **Innovation is in capability / problem-solution space, not infra
   novelty.** A wrapper over mature OSS that adds multi-op + BSM +
   slashing is usually more innovative than a from-scratch reimpl.
4. **Boringness test is blocking.** If the spec doesn't do something
   SaaS can't, don't ship a spec — iterate or kill.

## Execution Workflow (Three Branches)

### Branch A — "I want an idea" (exploration)

1. Ask: which categories? (user picks 1-3 from the 28 in
   `INNOVATE-CATEGORIES.md`, or says "surprise me" — then pick 3
   by interestingness). Always offer "intersection of X and Y"
   as a first-class option.
2. Ask: which customer archetype? (self-hosting / PaaS / direct-user).
   Multiple archetypes OK; most blueprints serve two.
3. Dispatch research sub-agents in parallel across the 5 sources,
   scoped to category × archetype. See `INNOVATE-RESEARCH-METHOD.md`
   for prompt templates.
4. Return a short report: top 5 blueprint-shaped opportunities, top 3
   gaps between hype and real solved problems, 2-3 cross-category
   intersection ideas, any mature OSS libraries worth wrapping (per
   `INNOVATE-OSS-WRAPPING.md`).
5. User picks one idea → proceed to Branch B with that idea as input.

### Branch B — "I have an idea" (specification)

1. One-sentence idea from user.
2. **Problem / solution framing** (1 minute):
   - Who hurts today? (specific persona, not "developers")
   - What do they do instead? (actual tool / workaround / lack)
   - Why does solving this require a blueprint specifically, not
     plain SaaS? (multi-op trust, verifiability, sovereignty,
     slashing, decentralized supply — name the reason)
3. **Customer archetype lock** (see `INNOVATE-CUSTOMER-ARCHETYPES.md`).
   Pick 1-2. This decides auth / billing / UX downstream.
4. **Multi-op design** (required, not optional; see
   `INNOVATE-MULTI-OP-PATTERNS.md`):
   - Coordinator selection (deterministic-hash / elected / leader
     per request / every-op-runs-it)
   - State convergence (raft / CRDT / deterministic-idempotent /
     no-shared-state)
   - Request routing (customer picks op / any op handles /
     workspace→op mapping)
   - Failure model (crash-tolerant / byzantine / slashable)
5. **OSS-wrapping check** (see `INNOVATE-OSS-WRAPPING.md`):
   - Is there mature OSS that's the capability core? Name it.
   - What does the blueprint wrap around it? (usually multi-op
     coordination + BSM billing + slashing)
   - If yes, the spec is mostly "how do we wrap X cleanly?" — this
     is often the highest-ROI path.
6. **BSM primitive selection** (read
   `TANGLE-BLUEPRINT-BSM-HOOKS.md` first):
   - Payment type: `PAY_ONCE` / `SUBSCRIPTION` / `EVENT_DRIVEN` /
     metered
   - Slash conditions (from BSM, not invented)
   - Lifecycle hooks to override
   - Tenancy: single-tenant-per-instance or multi-tenant
7. **Boringness test** (see `INNOVATE-BORINGNESS-TEST.md`): does this
   do something SaaS can't? If no, iterate or kill.
8. **LIMITS sketch** (3-5 counterweight entries per
   `tangle-blueprint-expert`'s honesty discipline, if that PR merged)
   to stress-test the pitch. Any claim that can't get a honest
   counterweight is a red flag.
9. **Handoff spec** — 1 page, structured as:
   - Problem (1 line)
   - Solution (1 line)
   - Customer archetype
   - Multi-op design (4 lines)
   - OSS wrapped (if any)
   - BSM primitives used
   - Why-not-SaaS (from boringness test)
   - Top 3 LIMITS

### Branch C — "Critique my half-built blueprint" (audit)

1. Read the user's existing repo / spec / RFC.
2. Run Branch B's questions retroactively — at each step, what does
   the existing work answer, what's missing, what's wrong?
3. Flag the common traps:
   - Settlement-adapter-style code that parallels BPM work
   - Single-op assumptions in what should be multi-op
   - Archetype drift (built like self-host, marketed as PaaS)
   - BSM primitive underuse (hand-rolled billing when a hook exists)
   - OSS-reinvent (built from scratch when a mature wrapper exists)
   - SaaS-with-extra-steps (fails boringness test)
4. Output: delta between current state and a Branch B spec. Ranked
   fix list with owner + effort estimate.

## Output Style

1. Start with the branch picked (A / B / C) so the conversation
   shape is explicit.
2. Keep intermediate steps short — the output is the 1-page spec,
   not a process narrative.
3. For Branch A research output: summarize, cite sources, don't
   paste raw findings.
4. For Branch B spec: strict 1-page ceiling. If it overflows, the
   idea is too complex and should be scoped down.
5. For Branch C audit: rank by "would block ship" vs "nice-to-fix."
6. Always end with: exact kickoff prompt for `tangle-blueprint-expert`
   or `/blueprint-factory`.

## Anti-Patterns to Reject

1. Producing a spec without any multi-op design (multi-op is default).
2. Inventing adapter traits parallel to BSM primitives.
3. Building a "new X protocol" when wrapping mature OSS is sufficient.
4. Archetype ambiguity — if the spec can't name one primary archetype,
   force the choice.
5. Bypassing the boringness test with hand-waving about "ecosystem
   benefits."
6. Specs longer than one page — that's a sign of un-scoped ideas.
7. Reinventing a research step that `INNOVATE-RESEARCH-METHOD.md`
   already covers.

## Source of Truth

This skill lives at `plugins/tangle-blueprint-innovate/skills/tangle-blueprint-innovate/`
within the `tangle-network/skills` marketplace. Install via:

```
/plugin install tangle-blueprint-innovate@tangle-network-skills
```

## When Not to Use This Skill

- User is already executing on a spec (use `tangle-blueprint-expert`)
- User wants to ship a specific feature in an existing blueprint
  (use `/pursue` or equivalent)
- User wants generic product strategy (use a marketing skill, not this)
- User wants code (hand off after the spec exists; this skill does
  not write code)
