# Tangle Blueprint Learnings (General)

Use this as a reusable playbook for **any** blueprint and **any** service type.

Canonical context for purpose and hierarchy lives in [TANGLE-BLUEPRINT-OVERVIEW.md](./TANGLE-BLUEPRINT-OVERVIEW.md).

## Core Invariants

1. Blueprint implementation is Rust + `blueprint-sdk` wiring, not generic app scaffolding.
2. For net-new blueprints, scaffold with `cargo tangle blueprint create` before custom edits.
3. Jobs are mutation surfaces only.
4. Read/query paths stay off-chain (`eth_call` and/or operator HTTP APIs).
5. Runtime substrate concerns stay separated from product blueprint concerns.
6. “Done” requires evidence, not claims.

## Hierarchy Invariant (Blueprint vs Service Instance)

1. Blueprint = abstract template/capability contract.
2. Operators register for that blueprint.
3. Customer selects a subset of registered operators during service request.
4. Service instance is the concrete running unit created from that request.

Confusing these levels causes incorrect lifecycle design, auth checks, and UI wording.

## Great Patterns

1. Thin job handlers + clear adapter boundaries.
2. Strong lifecycle state machine with explicit allowed transitions.
3. Clear ownership/auth checks at every state-changing entrypoint.
4. Product-first UX defaults with advanced controls hidden behind Advanced settings.
5. Reuse shared packages before writing local abstractions.
6. Small PRs with validation logs attached in each PR description.

## Do

1. Define scope early: product layer vs runtime layer vs infra layer.
2. Write a Build Contract before coding: jobs, queries, non-goals, validation gates.
3. Start new blueprints from official scaffold (`cargo tangle blueprint create`) and compile immediately.
4. Reuse `@tangle-network/blueprint-ui` for provisioning/chain/service/job UI patterns.
5. Use `@tangle-network/agent-ui` only when the product exposes agent runtime UX (terminal/chat/session).
6. Add app-local adapters when endpoint shapes differ from shared hook contracts.
7. Keep compatibility decisions explicit in docs (what is supported now vs planned).
8. Run at least one real local non-mocked flow for changed codepaths.
9. Use `docs/TANGLE-BLUEPRINT-CLI-RUNBOOK.md` as the source of truth for deploy/request/approve/job proof flows.
10. Decide tenancy model explicitly per service design:
   - single-tenant per service instance
   - multi-tenant per service instance with tenant isolation
11. Tie auth design to tenancy:
   - service-level auth for single-tenant
   - service + tenant-level auth for multi-tenant

## Don’t

1. Don’t treat “blueprint” as a generic backend/web app exercise.
2. Don’t manually scaffold a new blueprint workspace when `cargo tangle blueprint create` is available and working.
3. Don’t mix read-only behavior into mutation jobs.
4. Don’t duplicate shared UI primitives/hooks in app-local code without clear reason.
5. Don’t overfit one product’s naming into shared architecture docs.
6. Don’t mark work complete with only mocked tests when real paths changed.
7. Don’t ship architecture intent as if implemented; label roadmap items clearly.

## Avoid

1. Overexposing low-level runtime knobs in primary UX.
2. Binding product logic directly to one backend implementation.
3. Monolithic PRs that combine architecture, runtime, UI, and docs with no checkpoints.
4. Silent contract drift between UI hooks and operator API endpoints.
5. “Legacy for safety” in greenfield contexts when clean replacement is intended.

## Reuse Boundaries

1. `blueprint-ui` scope:
   - provisioning, chain selection, operator discovery, service validation, quote flows, job forms/submission.
2. `agent-ui` scope:
   - agent-facing terminal/chat/session UX and related streaming/render primitives.
3. App-local scope:
   - product copy, route composition, field transforms, product-specific auth and endpoint adapters.

## Validation Ladder (Minimum)

1. Rust compile checks at workspace root.
2. Relevant unit/integration tests.
3. UI typecheck/build when UI changed.
4. Real local happy-path run for non-mocked flow verification.
5. Explicit final report evidence: commands run, pass/fail, known gaps.
6. Auth/isolation proof for chosen tenancy model.

## Failure Classes and Corrections

1. Process failure:
   - Symptom: coding started without Build Contract.
   - Correction: stop, define contract, resume.
2. Architecture failure:
   - Symptom: jobs and queries blended.
   - Correction: split mutation and query surfaces.
3. Integration failure:
   - Symptom: shared hooks mismatch API routes/payloads.
   - Correction: add thin adapter or align API contract.
4. Verification failure:
   - Symptom: “done” reported without runtime proof.
   - Correction: run real path and capture evidence.
5. Reuse failure:
   - Symptom: duplicate app-local abstractions.
   - Correction: extract/use shared package primitives.

## Quick Pre-Merge Checklist

1. Are mutation jobs and read/query surfaces cleanly separated?
2. Are runtime/product boundaries explicit in code and docs?
3. Are shared UI packages used where appropriate?
4. Are defaults sensible and advanced controls gated?
5. Did at least one real local flow pass for changed paths?
6. Is validation evidence included and reproducible?
7. Are known limitations documented as limitations (not implied complete)?

## Learning Capture Template (Append New Entries)

- Date:
- Service/use-case category:
- What worked:
- What failed:
- Failure class:
- Root cause:
- Process update applied:
- Guardrail added:
