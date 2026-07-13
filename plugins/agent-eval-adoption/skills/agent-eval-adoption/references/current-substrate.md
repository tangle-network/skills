# Current Substrate Line

Use this reference before editing adoption snippets or claiming package truth.
This table is the single source of version truth for the skill — the prose in
`SKILL.md` names packages and subpaths, not point versions. Re-run
`../scripts/check-substrate-versions.sh` before changing anything below
(last run 2026-07-12).

| Package | Current npm version | Notes |
| --- | ---: | --- |
| `@tangle-network/agent-eval` | `0.116.0` | `/contract` owns the stable eval and improvement lifecycle. `/campaign` exports held-out comparison, power checks, neutral-content checks, Lineage, discriminative-case selection, composed prompt/skill/memory/policy proposers, the durable search ledger, and cross-surface interaction analysis. Root exports paired statistics including `pairedSignTest`. Runtime peer range accepts `>=0.114.0 <1.0.0`. |
| `@tangle-network/agent-runtime` | `0.94.6` | Root exports `improve`, approved-candidate execution, and typed profile diffs. `/loops` owns product runners and trace sources. `/knowledge` exports `runKnowledgeImprovementJob`; memory is a first-class `improve` surface. |
| `@tangle-network/agent-interface` | `0.25.0` | Neutral `AgentProfile`, `AgentProfileDiff`, changed-axis detection, and capability contracts. Harness remains a run/executor coordinate, not a profile field. |
| `@tangle-network/agent-knowledge` | `1.12.1` | Knowledge sources, research, RAG and retrieval evaluation, memory adapters, readiness, candidate workspaces, and promotion. Runtime depends on it to compose supervised knowledge jobs. |
| `@tangle-network/agent-profile-materialize` | `0.3.2` | Shared profile-to-workspace materializer over agent-interface `0.25`. |
| `@tangle-network/sandbox` | `0.10.4` | Current public sandbox execution package. Runtime peer range is `>=0.8.0 <1.0.0`. |
| `@tangle-network/tcloud` | `0.4.14` | LLM/router helper package. |
| `@tangle-network/traces` | `0.8.27` | Provider adapters and local trace tooling; preserves sibling worktrees, captures Codex custom tools and subagent lifecycle events, and excludes injected control messages from user-reaction signals. |

## Current Primitive Map

- Use `defineLeaderboard({ name, cases, prompt, score, ... })` from
  `@tangle-network/agent-runtime/loops` to author a product eval leaderboard.
  It owns the frame (standard flags, fresh default run-dir, axis expansion,
  one `runProfileMatrix` call, export + leaderboard rendering,
  `toBenchmarkAdapter()`); products write the domain lines only.
  `runProfileMatrix` stays public as the escape floor; the level-2 `dispatch`
  override is how in-process products plug in.
- Use `resolveSandboxClient({ backend: 'sandbox' | 'bridge' | 'router' })`
  (`/loops`) for harness-in-box execution and
  `resolveAgentBackend({ kind: 'router' | 'tcloud' | 'cli-bridge' | 'sandbox' })`
  (root) for in-process agents. Never hand-roll a backend factory or fake a
  box — `inlineSandboxClient` and the bridge executor already exist.
- Use `streamAgentTurn` / `collectAgentTurn` (`/loops`) for one agent turn as
  one normalized event contract over box / executor / chat backends.
- Use `improve(profile, findings, { surface })` from
  `@tangle-network/agent-runtime` (root) as the one pluggable RSI verb — a
  facade over agent-eval's `selfImprove`. `surface` is
  `'prompt' | 'skills' | 'tools' | 'mcp' | 'hooks' | 'subagents' | 'workflow' |
  'agent-profile' | 'memory' | 'code' | 'rollout-policy'` (default `'prompt'`).
  Prompt, skills, memory, and rollout policy have shared defaults; code needs a
  repo, and every other surface needs an explicit proposer. Missing wiring
  fails before a candidate runs.
- Use `runKnowledgeImprovementJob` from `@tangle-network/agent-runtime/knowledge`
  for candidate workspace + supervised research/update + readiness + promotion.
  `agent-knowledge` owns sources, RAG/retrieval, memory adapters, citations, and
  knowledge quality; products supply the goal, domain evidence, policy, and budget.
- Use `selfImprove` / `runImprovementLoop` from
  `@tangle-network/agent-eval/contract` for the gated closed loop
  (train/dev optimization → held-out re-score → gate → optional PR).
  `runOptimization` / `runCampaign` are the inner search bodies without a
  promotion shell.
- The promotion gate is `defaultProductionGate` (the composed default
  `runImprovementLoop` uses) or the composable `heldOutGate`, both from
  `/contract` and `/campaign`. Both ship on the MEAN paired-delta bootstrap CI
  lower bound (`heldoutStatistic` defaults `'mean'`, tie-robust) and report
  `deltaMean` + `deltaMedianDiagnostic` + `tieFraction`. `powerPreflight`
  (`/campaign`) tells you BEFORE spending a search whether the effect is even
  detectable at this holdout size/variance.
- Prove a held-out lift comes from CONTENT, not added prompt/mount FOOTPRINT,
  with `neutralizationGate` (`/campaign`, new in 0.107.0): it re-scores a
  footprint-matched PLACEBO variant (same layout + length, zero content, via
  `neutralizeText`) and rejects when the neutralized variant reproduces most of
  the candidate's lift. Wire it by passing `runImprovementLoop({ neutralize })`,
  which populates `GateContext.neutralizedJudgeScores` / `neutralizedArtifacts`;
  compose it onto `defaultProductionGate` with `composeGate`.
- Build the holdout with `scoreDiscrimination` / `selectDiscriminative`
  (`/campaign`) — pick scenarios by discrimination power and drop saturated
  ties, which carry no signal and blind the gate.
- Multi-track improvement is the Lineage DAG (`Lineage`, `runLineage`,
  `runLineageLoop`, `heuristicGovernor` / `callbackGovernor`,
  `fsLineageStore` / `memLineageStore`, `Governor`) from `/campaign`.
- Use `expandProfileAxes({ base, harnesses?, models? })` with `CODING_HARNESSES`
  to generate the harness × model profile sweep from one base profile, run it
  with `runProfileMatrix`, and pivot the records with
  `groupRunsByAgentProfileCell`. A vendor-locked harness that supports none of
  the requested models SNAPS to its native default (`HARNESS_NATIVE_MODEL`) —
  it is never dropped. Never re-declare a harness list in a product,
  never read `metadata.harness` by hand, and never bake the harness into the
  model id.
- Use `TraceSource` as the trace boundary:
  - `createPushTraceSource()` for owned in-process tool loops.
  - `sandboxSessionTraceSource(box, sessionId, ...)` for sandbox or fleet
    session parts.
- `TANGLE_API_KEY` (`sk-tan-…`) is the one all-products key — it drives the
  sandbox AND the paid router.
- `compositeProposer`, `memoryCurationProposer`, `skillOptProposer`,
  `policyEditProposer`, and the other public proposer constructors are exported
  from `/campaign`; compose them instead of duplicating proposal orchestration.
- Do not reference `createFanoutVoteDriver`, `LoopSandboxClient`,
  `runProductionLoop`, `runMultiShotOptimization`, `analyzeOptimizationResult`,
  `createProductionTraceSink`, or `ProductionTraceSink` as current APIs unless
  a fresh package tarball check proves they were reintroduced. `analyzeRuns()`
  (`/contract`) is the current run-analysis entry point.

## Adoption state

- tax / legal / insurance / gtm / creative agents: on `defineLeaderboard`.
- physim: on `streamAgentTurn`.

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
