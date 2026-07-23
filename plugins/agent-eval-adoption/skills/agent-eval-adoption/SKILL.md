---
name: agent-eval-adoption
description: Adopt agent-eval: run the real agent, capture records, calibrate cases, and control promotion.
---

# Agent Eval Adoption

Use this for product-side integration of `@tangle-network/agent-eval`.
Use the installed package's source, types, README, and exports as the API reference.
This skill defines the integration sequence, not a copied catalog of fast-changing functions.

## Read Current Truth

Before writing imports:

1. Inspect the product lockfile and installed package versions.
2. Read the installed package README and relevant subpath declarations.
3. Confirm symbols from the installed type declarations or package source.
4. Find existing evals, run records, traces, and profile composition.
5. Reconcile that wiring before adding anything.

Start with `@tangle-network/agent-eval/contract` for the stable product surface.
Use lower-level subpaths only when the stable surface cannot express the requirement.

## Run The Production Agent

Evaluate the same profile, entrypoint, tools, data, and dependency path used by the product.
An eval adapter is valid only when it delegates to that exact call.
Fail when the expected backend did not run, model use is missing, or required tool and state evidence was not captured.

## Capture Complete Records

Store one canonical run record per attempt with:

- run, case, attempt, split, profile, model, and code identity;
- input, final output, tool calls, state changes, and trace location;
- objective check and model-judge results;
- outcome, errors, retries, tokens, cost, and latency;
- source provenance and redaction state.

Preserve unknown provider fields at the adapter boundary.
Do not turn missing evidence into a default score.

## Build Cases That Discriminate

Each case names one user capability, a realistic request, independently observable success, a plausible failure, and its environment boundary.
Use code for objective facts and a model judge only for semantic facts.
Prove the scoring path accepts a known good fixture and rejects a realistic bad fixture before running a matrix.

## Compare Fairly

Run baseline and candidate on the same cases, seeds, model snapshot, limits, and dependency state.
Keep development cases separate from cases used for the final decision.
Report paired change, uncertainty, critical regressions, failures, tokens, cost, and latency.
Service and measurement failures are not agent losses.

## Improve Without Silent Mutation

Search may propose prompt, profile, code, memory, retrieval, or knowledge changes.
Every proposal retains exact identity, rationale, diff or snapshot, development evidence, and held-back comparison.
Search code does not write live state.
The product owns review authority, atomic application, retry reconciliation, rollback, and audit records.

## Package Boundaries

| Concern | Owner |
|---|---|
| Portable agent definition | `@tangle-network/agent-interface` |
| Execution, streaming, delegation, and candidate activation | `@tangle-network/agent-runtime` |
| Cases, scoring, comparisons, statistics, and eval records | `@tangle-network/agent-eval` |
| Sources, retrieval, memory, citations, and knowledge candidates | `@tangle-network/agent-knowledge` |
| Product data, permissions, UI, funding, and atomic writes | Consuming product |

Move reusable missing behavior to the owning package.
Do not add product-local copies of statistics, trace parsing, candidate identity, or promotion logic.

## Completion

One customer-like request must prove:

```text
request -> production agent -> complete run record -> scoring
-> baseline/candidate comparison -> review decision -> applied change or correctly blocked action
```

Report installed versions, exact imports, case and run counts, calibration results, artifact paths, comparison output, approval path, and tests run.
Mocks can test adapters but do not replace one real backend run.

## Then consider

- `eval-agent` when semantic scoring needs a calibrated model judge.
- `build-with-agent-runtime` when wiring execution, delegation, or candidate activation.
- `build-with-agent-knowledge` when evaluating retrieval, memory, or knowledge candidates.
- `agent-stack-adoption` when auditing the complete multi-package product path.
- `verify` before release.
