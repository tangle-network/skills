---
name: agent-stack-adoption
description: Integrate or audit Tangle runtime, evaluation, knowledge, profiles, and candidate activation.
---

# Agent Stack Adoption

Adoption means one production agent becomes observable, measurable, and safely improvable through shared packages.
Select capabilities by product need and prove each on the real path.

## Contract

1. **Read current truth.** Inspect the real entrypoint, lockfile, installed package READMEs, types, and exports before designing changes.
Never copy versions or API names from this skill.
Reconcile existing wiring before creating anything.

2. **Compose one profile.** One function returns the complete `AgentProfile`: prompt, resources, skills, tools, MCP, hooks, subagents, model, permissions, budgets, and identity.
Production, evaluation, optimization, and materialization consume that function.

3. **Use one execution path.** Instrument and evaluate the exact production call.
Do not add a direct-router shortcut, fake worker, eval-only profile, or legacy implementation.
Backend errors, zero model usage, and missing expected tool events fail loudly.

4. **Preserve complete evidence.** Normalize provider data only at the adapter boundary.
Keep unknown fields, provenance, tenant, project, repo, run, profile, calls, results, outcomes, feedback, tokens, cost, and latency.
Redact secrets before export and flush durable writes.

5. **Respect package ownership.** `agent-interface` owns contracts; profile materialization owns workspace files; runtime owns execution, delegation, and candidate activation; eval owns cases, judges, search, comparisons, and uncertainty; knowledge owns research, retrieval, memory, citations, and knowledge candidates.
The product owns domain cases, credentials, policy, approvals, storage transactions, and UI.
Move generally reusable missing behavior upstream.

6. **Produce candidates, never silent mutations.** Improvement may propose exact diffs for prompts, skills, tools, MCP, hooks, subagents, workflow, code, research, retrieval, memory, or knowledge.
Every result remains detached and reviewable until authorized.

7. **Prove improvement.** Build cases from real user jobs and production failures.
Calibrate scoring with known weak and strong outputs.
Compare baseline and candidate on the same unseen cases, with paired uncertainty, per-dimension regressions, critical failures, cost, and latency.

8. **Require authority.** Billing, writes, dispatch, promotion, pull requests, and messages require explicit customer approval unless stored tenant policy authorizes them.
Persist approve, reject, edit, and outcome feedback.

9. **Close the loop.** One customer-like run proves request to profile to execution to trace to analysis to proposal to exact candidate to fresh comparison to decision to promoted delivery or correctly blocked side effect.
File presence and mocked-only tests do not count.

## Completion Evidence

Any omission means partial adoption.

- Current installed versions and exports are recorded.
- Production and evaluation use the same profile and execution identity.
- Real backend use, tool events, errors, cost, and latency are captured.
- Every enabled improvement surface has candidate, validation, approval, application, and rollback paths.
- Customer-like local and hosted runs prove API, storage, and denied side effects.
- Duplicate paths and product-local copies of shared behavior are removed.

## Then consider

- `agent-eval-adoption` when implementing evaluation and comparison details.
- `build-with-agent-runtime` when implementing execution or candidate activation.
- `build-with-agent-knowledge` when implementing retrieval, memory, or knowledge improvement.
- `eval-agent` when semantic scoring needs a model judge.
- `verify` before declaring adoption complete.
