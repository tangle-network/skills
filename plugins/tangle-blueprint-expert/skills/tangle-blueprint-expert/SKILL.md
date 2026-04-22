---
name: tangle-blueprint-expert
description: Expert workflow for designing, implementing, testing, and documenting Tangle Blueprints with correct blueprint/operator/service-instance hierarchy, tenancy/auth modeling, and production-like CLI validation.
---

# Tangle Blueprint Expert

Use this skill for any request that involves:

- building or refactoring a Tangle Blueprint
- defining blueprint architecture or job/query boundaries
- writing BSM (Blueprint Service Manager) Solidity contracts
- operator registration and service-instance lifecycle design
- production-like deploy/request/approve/job testing with `cargo tangle`
- blueprint UI flows for provisioning/service/jobs
- production runtime patterns (operator API, auth, secrets, circuit breakers)
- GPU-accelerated blueprints (detection, BSM validation, remote provisioning)
- shielded/private payment integration (Credit Mode, RLN Mode, VAnchor)
- pricing config and RFQ quote flows
- subprocess lifecycle management (vLLM, Ollama, inference engines)

## Required Reading Order

**Conceptual foundation (read first):**
1. `references/TANGLE-BLUEPRINT-OVERVIEW.md` -- Protocol vision, hierarchy, tenancy, auth
2. `references/TANGLE-BLUEPRINT-BPM-VS-INSTANCE.md` -- Blueprint Manager (SDK-provided) vs Blueprint Instance (author-written) layer boundary, billing/lifecycle who-does-what, adapter anti-pattern
3. `references/TANGLE-BLUEPRINT-BUILD-PROCESS.md` -- 5-phase build process and validation gates

**Implementation references (read as needed):**
3. `references/TANGLE-BLUEPRINT-SDK-PATTERNS.md` -- Rust SDK programming model: Router, extractors, runner wiring, main.rs boilerplate, testing
4. `references/TANGLE-BLUEPRINT-REPO-STRUCTURE.md` -- Canonical bin/lib repo layout, workspace patterns, contracts/scripts/config organization
5. `references/TANGLE-BLUEPRINT-BSM-HOOKS.md` -- All 30+ Solidity BSM hooks with signatures, job types, payment models, slashing, membership
6. `references/TANGLE-BLUEPRINT-PRODUCTION-PATTERNS.md` -- Operator API, BPM bridge, session auth, secrets, circuit breakers, reaper/GC, billing, TEE
7. `references/TANGLE-BLUEPRINT-ADVANCED-PATTERNS.md` -- GPU provisioning, shielded payments (Credit/RLN), pricing TOML/RFQ, remote providers, subprocess lifecycle
8. `references/TANGLE-BLUEPRINT-CLI-RUNBOOK.md` -- Complete CLI command reference: scaffold, deploy, register, service lifecycle, jobs, operator, delegator
9. `references/TANGLE-BLUEPRINT-LEARNINGS.md` -- Do/don't patterns, failure classes, validation ladder

**Discipline references (read before PR / before mainnet):**
10. `references/TANGLE-BLUEPRINT-HONESTY-DISCIPLINE.md` -- `LIMITS.md` pattern, claim-with-counterweight rule, pre-complete gate, paranoid-default rule for security-adjacent code, stub discipline
11. `references/TANGLE-BLUEPRINT-META-REVIEW.md` -- Continuous adversarial pass (Phase 3.5), persona-dispatch synthesis (Phase 6), 10-point scorecard + tier mapping, operator-vs-agent division of labor

Do not skip the overview. It defines the protocol and business model semantics.

## Source of Truth

This skill lives at `~/skills/tangle-blueprint-expert/` and is symlinked into `~/.claude/skills/`.

Reference codebases:
- [tangle-network/blueprint](https://github.com/tangle-network/blueprint) -- Blueprint SDK (Rust, cargo-tangle CLI)
- [tangle-network/tnt-core](https://github.com/tangle-network/tnt-core) -- Core Tangle protocol contracts (BSM hooks, staking, payments)
- [tangle-network/ai-agent-sandbox-blueprint](https://github.com/tangle-network/ai-agent-sandbox-blueprint) -- Production blueprint example
- [tangle-network/ai-trading-blueprint](https://github.com/tangle-network/ai-trading-blueprint) -- Production blueprint example
- [vllm-inference-blueprint](~/code/vllm-inference-blueprint) -- GPU inference blueprint with shielded payments
- [shielded-payment-gateway](/tmp/shielded-payment-gateway) -- Privacy-preserving payment contracts + SDK

## Core Contract (Never Violate)

1. Blueprint is an abstract template, not a live instance.
2. Operators register for blueprints.
3. Customers select a subset of registered operators when requesting a service.
4. Service instance is the concrete running unit for that request.
5. Jobs mutate instance state; queries are read-only surfaces.

If these are mixed, stop and correct architecture first.

## Execution Workflow

1. Write a short Build Contract before code:
   - scope boundaries
   - job/query set
   - tenancy model (`single-tenant` or `multi-tenant`)
   - auth model (chain/operator/service/tenant)
   - BSM hooks needed (which to override from `BlueprintServiceManagerBase`)
   - validation gates and CLI proof steps
2. For net-new blueprint repos, scaffold first:
   - `cargo tangle blueprint create ...`
   - immediate `cargo check`
3. Implement with explicit boundaries:
   - BSM contract (extend `BlueprintServiceManagerBase`, override needed hooks)
   - Rust job handlers (Router + TangleArg/TangleResult + TangleLayer)
   - BlueprintRunner wiring (producer, consumer, background services)
   - Operator API (Axum HTTP alongside on-chain jobs)
   - Auth checks at all mutation entrypoints
   - UI defaults-first, advanced settings for low-level knobs
4. Run production-like validation:
   - deploy/register
   - operator register
   - service request + approve
   - resolve active service
   - job submit/watch
   - capture IDs (`blueprint_id`, `request_id`, `service_id`, `call_id`)
5. Report only with evidence (commands + outcomes + remaining gaps).

## Tenancy + Auth Rules

### Single-tenant service instance

- one customer trust boundary per instance
- auth should be instance-scoped
- tests must prove no cross-instance bleed

### Multi-tenant service instance

- one instance serves multiple tenants
- add tenant identity + authorization layer
- tests must prove tenant isolation and tenant-scoped authz

## UI Boundary Rules

1. Use `@tangle-network/blueprint-ui` for provisioning/chain/service/job UX.
2. Use `@tangle-network/agent-ui` only for terminal/chat/session agent runtime UX.
3. Keep product-specific glue in app-local code.
4. Do not duplicate shared primitives locally unless there is a hard contract mismatch.

## Validation Minimum

1. `cargo check`
2. relevant tests/smoke
3. if UI changed: build/typecheck and one non-mocked local happy path
4. if protocol/runtime changed: CLI lifecycle proof from runbook
5. tenancy/auth proof matching selected model

## Anti-Patterns to Reject

1. Treating blueprint as a generic backend service.
2. Collapsing blueprint/operator/service-instance semantics.
3. Mixing read paths into mutation jobs.
4. Shipping docs-only architecture intent as implemented reality.
5. Claiming done without deploy/request/approve/job evidence.
6. Writing a BSM without understanding which hooks fire for which lifecycle events.
7. Building an operator binary without an operator API for read-only operations.
8. Skipping session auth on off-chain endpoints.
9. Shipping a claim in README without a paired `docs/LIMITS.md` entry (see honesty discipline ref).
10. Declaring a feature "done" without running the pre-complete gate (see honesty discipline ref).
11. Defaulting security-adjacent code (JWT, encryption, transport) to the ergonomic primitive instead of the paranoid one (see honesty discipline ref).
12. Running persona / adversarial review only at the end, not continuously per commit (see meta-review ref).

## Output Style

When answering with this skill:

1. Start with architecture stance (hierarchy + tenancy + auth).
2. Give exact command path for validation.
3. Provide concise evidence and explicit unresolved gaps.
4. Keep language direct and implementation-first.
