# Tangle Blueprint Build Process (Mandatory)

Use this process **every time** Drew asks to build a Tangle Blueprint.

Read [TANGLE-BLUEPRINT-OVERVIEW.md](./TANGLE-BLUEPRINT-OVERVIEW.md) first for protocol vision, hierarchy, and economic model context.

## Phase -1 — Scaffold First (Mandatory for New Blueprints)

For any net-new blueprint repo, first generate from the official scaffold CLI:

```bash
cargo tangle blueprint create \
  --name <blueprint-name> \
  --tangle \
  --skip-prompts \
  --project-description "<short description>" \
  --project-authors "<name/email>"
```

Notes:
- The command is `create` (not `new`).
- With `--skip-prompts`, `--project-description` and `--project-authors` are required.
- Do not hand-roll initial workspace structure when this command is available.
- Immediately run `cargo check` in the generated workspace before any product edits.
- Confirm generated `blueprint-sdk` matches latest crates.io/mainline expectation before proceeding.

## Trigger
Any request like:
- "build a blueprint"
- "create a Tangle blueprint"
- "migrate X to blueprint"
- "scaffold a new blueprint repo"

## Non-Negotiable Definition
A valid Tangle Blueprint is:
1. **Rust-based**
2. Uses **blueprint-sdk patterns/primitives**
3. Preserves architecture boundary:
   - **Jobs** = state-changing operations only
   - **Read/query** = query surfaces / `eth_call` / off-chain HTTP
4. Is prepared for **incremental PR-based development** (not one-shot dump)
5. If it ships UI, uses shared UI boundaries correctly:
   - **Provisioning + chain/service/job UX** in `@tangle-network/blueprint-ui`
   - **Agent terminal/chat/session UX** in `@tangle-network/agent-ui` only when the blueprint/app exposes agent runtime interaction surfaces
   - product-specific glue only in app-local code

If any of the above is missing, it is **not** a valid blueprint implementation.

## Protocol Hierarchy Contract (Must Be Documented)

Every blueprint implementation must explicitly preserve this hierarchy:

1. **Blueprint** = template/capability definition.
2. **Operator registration** = operators opt into that blueprint.
3. **Service request** = customer selects a subset of those operators + request params.
4. **Service instance** = concrete running instance of the blueprint for that request.

Do not describe a blueprint as if it is already a live service instance.
Do not describe operator registration as customer provisioning.
Service behavior, auth model, and lifecycle jobs are evaluated at service-instance scope.

---

## Phase 0 — Alignment (before coding)
1. Confirm scope in one paragraph: product layer vs runtime layer vs infra layer.
2. State required job set and read-only query set.
3. Declare tenancy model (`single-tenant` vs `multi-tenant`) and why.
4. Define operator/customer role model:
   - who can register
   - who can request/select operators
   - who can call which state-changing jobs
5. Define authentication strategy at each level:
   - chain-level caller authorization
   - operator identity checks
   - tenant identity (if multi-tenant)
6. Identify canonical reference repos and paths.
7. Define acceptance criteria (build/test/smoke/docs/PR).
8. If UI is in scope, define:
   - route map (`/create`, `/instances`, `/instances/:id`, etc.)
   - shared package boundary plan (`blueprint-ui` vs `agent-ui` vs app-local)
   - default settings vs advanced settings (avoid over-exposing low-level knobs)
9. Define testing infrastructure for the selected tenancy model:
   - single-tenant isolation checks
   - multi-tenant isolation/noisy-neighbor/authz checks
10. Define which CLI lifecycle checks from `docs/TANGLE-BLUEPRINT-CLI-RUNBOOK.md` will be executed as proof for this change.

Output this as a short "Build Contract" section in chat before implementation.

---

## Phase 1 — Reference-first analysis
Before writing code, inspect at least:
- `~/code/blueprint`
- `~/code/ai-agent-sandbox-blueprint`
- `~/code/ai-trading-blueprints`
- and, when UI is in scope:
  - `~/code/blueprint-ui`
  - `~/code/ai-agent-sandbox-blueprint/packages/agent-ui`

Extract and document:
- crate/workspace structure
- runner wiring
- SDK integration points
- job declaration patterns
- registration/runtime boot patterns
- UI contract boundaries and reusable primitives/hooks already available

Do not scaffold generic web service architecture as a substitute.

---

## Phase 2 — Implementation rules
1. Use feature branches only.
2. Keep commits small and cohesive.
3. No Co-authored-by trailers unless explicitly requested.
4. Exclude task scratch files (e.g. `CODEX_*`) from commits.
5. README must include Tangle banner + concise architecture + job/query boundary.
6. Include CONTRIBUTING.md with branch/commit/PR standards.
7. Do not duplicate shared UI primitives/hooks locally when equivalent exists in `blueprint-ui` or `agent-ui`.
8. Keep service/provisioning flows product-focused:
   - sane defaults in primary UI
   - low-level runtime options behind "Advanced"
9. If operator API serves UI assets:
   - keep `ui/` as source of truth
   - keep served directory (for example `control-plane-ui/`) as generated output only
   - provide explicit build-sync command (for example `pnpm run build:embedded`)
   - ensure HTTP routes serve split chunks (`/assets/*`) rather than forcing monolithic bundles

---

## UI Boundary Contract (when UI is shipped)
1. Use `@tangle-network/blueprint-ui` for:
   - chain selection, operator discovery, service validation
   - quote flows, job forms, job submission patterns
2. Use `@tangle-network/agent-ui` for:
   - terminal, chat/session streaming, run/tool rendering
   - only when those agent runtime features are in scope
3. App-local UI code should contain only:
   - product-specific copy, route composition, field transforms, auth adapters
4. If an endpoint shape does not match a shared hook contract (example: auth route differences), implement a thin app-local adapter and do not fork the shared package behavior ad hoc.

---

## Phase 3 — Validation gate
Minimum validation before saying “done”:
- `cargo check` from repo root (or workspace equivalent)
- relevant tests/smoke checks
- git status clean (except explicitly ignored files)
- explicit evidence in final report
- if UI changed:
  - UI typecheck/build passes
  - embedded/static artifact sync step passes when applicable (`build:embedded`)
  - at least one non-mocked happy-path run against real local operator/API endpoints
  - proof that shared package boundaries were respected (no unnecessary local duplicates)
- if protocol/runtime flow changed:
  - execute relevant CLI lifecycle checks from `docs/TANGLE-BLUEPRINT-CLI-RUNBOOK.md`
  - capture/report resolved IDs as applicable (`blueprint_id`, `request_id`, `service_id`, `call_id`)
- tenancy/auth validation:
  - prove service-instance auth for all mutation jobs
  - single-tenant: prove instance-scoped isolation
  - multi-tenant: prove tenant-scoped isolation + authz boundaries

No validation evidence = not done.

---

## Phase 4 — PR discipline
If repo exists:
- push feature branch
- open PR with: problem, scope, non-goals, validation evidence, follow-ups

If repo does not exist:
- create repo
- push `main` baseline only if necessary
- do real work on feature branch + PR

---

## Phase 5 — Post-run learning loop (mandatory)
After each blueprint build attempt, append to:
- `docs/TANGLE-BLUEPRINT-LEARNINGS.md`

Template:
- Date
- Repo
- What worked
- What failed
- Failure class (process/spec/tooling/agent behavior)
- Process update applied

Every failure must produce a process improvement.

---

## Failure Patterns to Guard Against
- Building JS scaffold instead of blueprint-sdk Rust implementation
- Treating "blueprint" as generic backend service
- Missing SDK runner/registration wiring
- Mixing read-only actions into job handlers
- Reporting completion without build/test evidence
- Collapsing blueprint template, operator registration, and service-instance semantics into one concept
- Re-implementing provisioning/chain logic locally instead of using `blueprint-ui`
- Re-implementing terminal/chat/session UI locally instead of using `agent-ui` (when agent runtime UX is in scope)
- Shipping only mocked UI flows without a real local operator/API trace
- Exposing all backend knobs as first-class controls instead of using defaults + advanced settings
- Hand-editing generated operator-served UI artifacts instead of updating source UI and rebuilding
- Avoiding `/assets/*` static serving by forcing single-file UI bundles (performance regression)

---

## Default Execution Mode
Use coding agents for implementation, but enforce this process as manager:
- pre-brief with Build Contract
- mid-run checks against process gates
- hard stop if implementation drifts from blueprint-sdk definition

## Enforcement Checklist (Manager must verify)
- [ ] Reference repos were actually inspected before edits
- [ ] Rust + blueprint-sdk wiring present (not just docs claims)
- [ ] Jobs are mutations only; read-only paths are query/off-chain
- [ ] Validation evidence is attached (`cargo check` minimum)
- [ ] Branch is PR-ready with scope/non-goals documented
- [ ] Learning entry appended to `docs/TANGLE-BLUEPRINT-LEARNINGS.md`
