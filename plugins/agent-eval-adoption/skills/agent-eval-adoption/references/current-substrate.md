# Current Substrate Line

Use this reference before editing adoption snippets or claiming package truth.
This table is the single source of version truth for the skill — the prose in
`SKILL.md` names packages and subpaths, not point versions. Re-run
`../scripts/check-substrate-versions.sh` before changing anything below
(last run 2026-07-08).

| Package | Current npm version | Notes |
| --- | ---: | --- |
| `@tangle-network/agent-eval` | `0.108.0` | `/contract` is the frozen public barrel (`defineAgentEval`, `selfImprove`, `runEval`, `runCampaign`, `runImprovementLoop`, `defaultProductionGate`, `heldOutGate`, `analyzeRuns`, storage + `OutcomeStore` + intake adapters). `/campaign` adds the composable internals (`heldoutSignificance`, `pairHoldout`, `powerPreflight`, `neutralizationGate` + `neutralizeText` (footprint-matched placebo gate, new in 0.107.0), the Lineage DAG, `scoreDiscrimination` / `selectDiscriminative`). Root exports the harness × model axis (`CODING_HARNESSES`, `expandProfileAxes`, `runProfileMatrix`, `groupRunsByAgentProfileCell`, `harnessAxisOf`, `HARNESS_NATIVE_MODEL`); `/matrix`, `/multishot`, `/analyst`, `/traces` as documented. Runtime peer range accepts `>=0.101.0 <1.0.0`. |
| `@tangle-network/agent-runtime` | `0.89.0` | `/loops` exports `defineLeaderboard` (`resolveModel` seam, iteration metadata, generic `TArtifact`), `resolveSandboxClient`, `streamAgentTurn` / `collectAgentTurn`, `leaderboard` + renderers, the `TraceSource` family (`createPushTraceSource`, `sandboxSessionTraceSource`), the loop combinators + `worktreeFanout`. Root exports `resolveAgentBackend` and `improve` (the RSI verb). `/mcp`, `/agent`, `/intelligence`, `/profiles` as documented. |
| `@tangle-network/agent-interface` | `0.19.0` | The neutral `AgentProfile` contract + capability layer. Runtime peer range is `>=0.14.0 <1.0.0`. `AgentProfile` has NO top-level `harness` field — harness is a run-layer / executor coordinate (see SKILL.md). |
| `@tangle-network/agent-knowledge` | `1.10.0` | Optional knowledge-write and research primitives. Not a runtime peer dependency — products depend on it directly. |
| `@tangle-network/agent-profile-materialize` | `0.2.3` | Shared profile-to-workspace materializer. |
| `@tangle-network/sandbox` | `0.9.7` | Runtime peer range is `>=0.8.0 <1.0.0`. |
| `@tangle-network/tcloud` | `0.4.14` | LLM/router helper package. |
| `@tangle-network/traces` | `0.8.22` | Local trace SDK/tooling package. |

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
  `'prompt' | 'skills' | 'tools' | 'mcp' | 'hooks' | 'code'` (default
  `'prompt'`); `'code'` needs a repo + generator or it fails loud, `'skills'`
  optimizes a skill DOCUMENT via `ImproveSkillsOptions { document, writeBack }`.
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
- `compositeProposer` (`src/campaign/proposers/composite.ts`) runs N proposers
  on one surface with per-member provenance labels, but is NOT yet re-exported
  from `/campaign` — it is not consumer-reachable until that export lands.
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
