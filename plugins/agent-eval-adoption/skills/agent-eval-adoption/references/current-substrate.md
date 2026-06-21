# Current Substrate Line

Use this reference before editing adoption snippets or claiming package truth.
The versions below were checked on 2026-06-21 with `npm view`; re-run
`../scripts/check-substrate-versions.sh` before changing them.

| Package | Current npm version | Notes |
| --- | ---: | --- |
| `@tangle-network/agent-eval` | `0.95.1` | Exports `runImprovementLoop` and `runOptimization` from `@tangle-network/agent-eval/campaign`; no `runProductionLoop` in the 0.95.1 tarball check. |
| `@tangle-network/agent-runtime` | `0.70.0` | Exports `TraceSource`, `createPushTraceSource`, and `sandboxSessionTraceSource` from `@tangle-network/agent-runtime/loops`. |
| `@tangle-network/agent-interface` | `0.10.1` | Shared `AgentProfile` contract. Runtime peer range is `>=0.10.0 <1.0.0`. |
| `@tangle-network/agent-knowledge` | `1.7.0` | Optional knowledge-write and research primitives. Runtime peer range is `>=1.7.0 <2.0.0`. |
| `@tangle-network/agent-profile-materialize` | `0.1.0` | Shared profile-to-workspace materializer. |
| `@tangle-network/sandbox` | `0.8.2` | Runtime peer range is `>=0.8.0 <1.0.0`. |
| `@tangle-network/tcloud` | `0.4.13` | LLM/router helper package. |
| `@tangle-network/traces` | `0.8.0` | Local trace SDK/tooling package. |

## Current Primitive Map

- Use `runImprovementLoop` from `@tangle-network/agent-eval/campaign` for the
  gated promotion shell around train/dev optimization plus holdout re-score.
- Use `runOptimization` from `@tangle-network/agent-eval/campaign` for the
  inner candidate search body when no promotion shell is needed.
- Use `TraceSource` as the trace boundary:
  - `createPushTraceSource()` for owned in-process tool loops.
  - `sandboxSessionTraceSource(box, sessionId, ...)` for sandbox or fleet
    session parts.
- Do not reference `runProductionLoop`, `runMultiShotOptimization`,
  `createProductionTraceSink`, or `ProductionTraceSink` as current APIs unless
  a fresh package tarball check proves they were reintroduced.

## External Comparison Lessons

- Matt Pocock style: keep top-level skills small, composable, and predictable;
  move exact detail into references only when the sequence demands it.
- Anthropic style: use `references/` and `scripts/` for high-churn exactness;
  keep `SKILL.md` focused on trigger, process, and acceptance checks.
- Oh-my-codex style: explicit use / do-not-use boundaries and artifact-gated
  completion prevent vague "I researched it" endings.
- AutoResearch style: long-horizon work needs persistent state, stall detection,
  and executable completion artifacts; memory-only progress is not progress.
- Hallmark style: inspect first, critique before emitting, and use strict
  quality gates instead of generic taste words.
