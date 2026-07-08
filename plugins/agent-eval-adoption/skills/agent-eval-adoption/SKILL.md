---
name: agent-eval-adoption
description: "Substrate-primitive reference for adopting the current Tangle agent stack in a product. Covers defineLeaderboard product-leaderboard authoring, the two backend resolvers (resolveSandboxClient / resolveAgentBackend), streamAgentTurn run-turn streaming, defineAgent manifest, runLoop driven loops, TraceSource capture, scorecard + ship-gate CI, held-out promotion via runImprovementLoop, cross-profile matrix benchmarks, analyst-loop, and assertRealBackend Phase A guard. Before copying version or API names, run scripts/check-substrate-versions.sh and read references/current-substrate.md. PAIRS WITH: agent-stack-adoption (9-phase pipeline shape that consumes these primitives), agent-eval (substrate footgun bible + canonical product-agent file layout), eval-agent (LLM-as-judge rubric generation specifically)."
---

# Agent Eval Adoption — substrate primitives for product wiring

## Related skills — what to read when

| If you are... | Read |
|---|---|
| Working IN the agent-eval substrate repo, calling its primitives correctly, OR setting up the canonical `eval/` folder + 3 pnpm scripts in a product | `agent-eval` (project skill, auto-loaded in agent-eval repo) |
| Wiring the full 4-package stack end-to-end across 9 phases (single composer → ingestion → production-loop → MCP delegation → researcher → eval scenarios → viewer → matrix → live smoke → CI cron) | `agent-stack-adoption` — the pipeline shape that consumes the primitives THIS skill defines |
| Building an LLM-as-judge with rubrics generated from reference material | `eval-agent` — narrower, judge-component focused |
| Looking up specific substrate primitives (defineLeaderboard, resolveSandboxClient/resolveAgentBackend, streamAgentTurn, defineAgent, runLoop, MCP delegation, TraceSource, assertRealBackend, scorecard, analyst-loop, runAgentMatrix) for adoption | **THIS skill** |

Use this skill when wiring `@tangle-network/agent-eval` into a product repo, or
when reviewing such a wiring. It encodes the canonical shape shipped across the
vertical agents (`creative-agent`, `tax-agent`, `legal-agent`, `gtm-agent`,
`agent-builder`, `physim`) and the substrate.

- **Package versions live in ONE place — `references/current-substrate.md`.
  The prose below names packages and subpaths, not point versions; re-run
  `scripts/check-substrate-versions.sh` and update that table before changing a
  pin.**
- **`@tangle-network/agent-interface`** — the NEUTRAL contract / single
  source of truth. Owns `AgentProfile`, `AgentProfileMcpServer`, `HarnessType`,
  `ReasoningEffort`, `Part` / `ToolPart` / `ToolState`, and the capability layer
  (`harnessSupportsModel`, `reasoningEffortsFor`). Every other package normalizes
  into these types; `@tangle-network/sandbox` re-exports them for back-compat.
  The neutral `AgentProfile` has NO top-level `harness` field — harness is a
  run-layer / executor coordinate, not a profile field.
- **`@tangle-network/agent-runtime`** — the loop kernel, drivers,
  profile data, MCP delegation server, `defineAgent`, surface adapters, the
  `TraceSource` family, `defineLeaderboard` (the product-leaderboard facade),
  `resolveSandboxClient` / `resolveAgentBackend` (the two backend resolvers),
  `streamAgentTurn` / `collectAgentTurn` (the one run-turn event contract), and
  `improve` (the one pluggable RSI verb — a facade over agent-eval's
  `selfImprove`).
- **`@tangle-network/agent-eval`** — scorecard, backend-integrity guard, analyst
  loop, matrix, and the campaign machinery. `/contract` is the frozen public
  barrel (`defineAgentEval`, `selfImprove`, `runEval`, `runCampaign`,
  `runImprovementLoop`, the `defaultProductionGate` / `heldOutGate` promotion
  gate, `analyzeRuns`, storage + `OutcomeStore` + intake adapters); `/campaign`
  adds the composable internals (`heldoutSignificance`, `pairHoldout`,
  `powerPreflight`, the Lineage DAG, `scoreDiscrimination` /
  `selectDiscriminative`); the root owns the harness × model eval axis
  (`CODING_HARNESSES`, `expandProfileAxes`, `runProfileMatrix`,
  `groupRunsByAgentProfileCell`, `HARNESS_NATIVE_MODEL`) and the multishot
  transport seam (`MultishotTransport` — `agentTransport` / `driverTransport`).
- **`@tangle-network/agent-profile-materialize`** — the shared per-harness
  materializer (`materializeProfile` / `WorkspacePlan` / `applyWorkspacePlan`)
  that turns one `AgentProfile` into a concrete harness workspace.
- **`@tangle-network/agent-knowledge`** — optional companion package
  (not a runtime peer): knowledge writes + researcher fanout.

### Capability layer — model/effort negotiation

`@tangle-network/agent-interface` ships the capability functions that gate which
harness can run which model at which thinking depth:

- `harnessSupportsModel(harness, model)` — does this harness expose that model.
- `reasoningEffortsFor(harness)` — the supported thinking tiers for a harness.
- The `ReasoningEffort` ladder is
  `none → minimal → low → medium → high → xhigh → ultracode`. A backend without a
  matching native tier clamps to its nearest (e.g. codex maps
  `xhigh` / `ultracode` → `high`). Author the effort you want; the materializer
  reconciles it per harness — do not hard-code harness-specific effort strings.

A fresh adoption is correct iff every block in the **Acceptance checklist** at
the bottom holds against the repo. Less than that ships blind evals or
unmeasured regressions.

## Principle

Wrap the real product workflow. Do not build a parallel toy path.

```txt
production chat
  -> TraceSource capture + OTLP / RunRecord persistence
  -> persisted records.jsonl + traces.jsonl + agent-profile cells
  -> assertRealBackend  ← refuses blind runs before the ship-gate
  -> scorecard append   ← (scenario × profileHash) timeline
  -> ship-gate          ← composite + per-persona threshold
  -> analyst-loop       ← findings → knowledge / improvement adapters
  -> improvement-loop   ← held-out gate → auto-PR
```

Everything below is a slot in this pipeline. The numbering is the order a
fresh product should adopt them.

## Autoresearch / GEPA campaign contract

When the user asks for autoresearch, GEPA, recursive improvement, or any system
that improves an agent over time, do NOT stop at "GEPA-shaped data." Build or
verify the whole campaign loop — the 9 patterns below are that loop:

1. Ingest live + eval runs into one typed corpus (run id, commit, model,
   prompt/config hashes, tool calls, artifacts, cost, user feedback) — patterns
   3 (trace sink) + 5 (scorecard).
2. Convert runs to optimizer examples + feedback trajectories; failed
   infra/auth/tool setup is a typed failed run, not a score — pattern 2
   (analyst loop).
3. Define mutable surfaces explicitly (prompt components, tool docs, workflow
   policy, retrieval corpus, generated code, product adapters) — pattern 1
   (`defineAgent`).
4. Search over those surfaces (GEPA-style reflection or `runOptimization`);
   every candidate gets a stable id + rationale — pattern 8
   (`runImprovementLoop` wraps the held-out promotion shell).
5. Apply each candidate in an isolated git worktree or branch, never in-place
   against unrelated user work — `createSurfaceImprovementAdapter`.
6. Rerun train/dev/holdout through the same product adapter. The held-out
   promotion gate (`defaultProductionGate` / `heldOutGate`) decides promotion on
   the MEAN paired delta; LLM judges cannot override deterministic failures,
   build failures, runtime failures, or missing credentials — pattern 7
   (the gate + `runImprovementLoop`).
7. Promote via reviewable PR or a clearly-named local candidate only when the
   gate passes. Persist the report, traces, candidate diff, release-confidence
   summary — pattern 9 (CI workflow integration).
8. Schedule recurring runs only after the one-shot campaign works locally and
   produces auditable artifacts.

Minimum surface area in a product repo:
- `pnpm eval` / equivalent — produces run artifacts + traces.
- `pnpm eval:improve` / equivalent — turns artifacts into findings + candidate
  prompt/code/knowledge changes.
- `pnpm eval:optimize` / equivalent — runs the search campaign + holdout gate.
- `.evolve/` (or equivalent) — stores findings, reports, candidate ids, traces,
  promotion decisions.

If any of the above is missing, the loop is not closed — see
`feedback_loop_closure_is_empirical` in operator memory.

## Agentic loops — `runAgentic`, strategies, and trace capture

The substrate ships a topology-agnostic loop kernel in
`@tangle-network/agent-runtime/loops`. The kernel orchestrates around
the sandbox SDK: each iteration is `sandboxClient.create({ backend: { profile } })`
+ `box.streamPrompt`. The kernel owns iteration accounting, concurrency,
abort propagation, cost aggregation, and trace emission. The driver owns
topology, the validator owns scoring, the output adapter owns event-stream
decode. For normal product adoption, use the higher-level strategy runner and
drop to raw `runLoop` only when you are authoring a custom `Driver`.

```ts
import { refine, runAgentic } from '@tangle-network/agent-runtime/loops'

const result = await runAgentic({
  surface,                         // real product adapter: open/tools/call/score/close
  task,
  routerBaseUrl,
  routerKey,
  model: 'anthropic/claude-sonnet-4-5',
  strategy: refine,                // import/use sample for best-of-N
  budget: 3,
})
```

### Foundational primitives — there is no "coder" role, only a profile + a gate

The §1.5 law applies: you do not instantiate a "coder agent" —
you **author an `AgentProfile`**, run it (often via a worktree-CLI executor) to
get a raw `WorktreePatchArtifact`, and **gate** the artifact with a
`DeliverableSpec`. Concretely:

- **`CoderTask` / `coderTaskToPrompt(task)`**
  (`@tangle-network/agent-runtime/profiles`) — the typed code-modification task
  shape plus its pure task-to-prompt formatter. There is no shipped coder
  `AgentProfile`; you author the profile (systemPrompt + model) yourself and
  choose the harness at run time.
- **`createWorktreeCliExecutor(options)`** — the executor that runs a profile in
  an isolated git worktree and returns a raw `WorktreePatchArtifact`. Requires
  `repoRoot`, `harness`, `taskPrompt`, and the authored `profile`.
- **`gateOnDeliverable(inner, deliverable)`** — wraps any `Executor` so its
  artifact must pass a `DeliverableSpec` (a plain `check(artifact) => boolean`)
  to count as delivered. The selector is never a judge.
- **`patchDelivered(opts?)`** — the mechanical patch gate as a
  `DeliverableSpec<WorktreePatchArtifact>` (diff size, forbidden paths,
  test + typecheck verdicts run by the spec itself). This is the replacement for
  the old `createCoderValidator` / `coderDeliverable`; slot any custom
  `DeliverableSpec` in as DATA.
- **`worktreeFanout(options)`** — the replacement for
  `multiHarnessCoderFanout` / `worktreeCoderFanout`: N profiles/harnesses fan out
  in parallel worktrees, each gated on `deliverable` (defaults to
  `patchDelivered(opts)`), winner chosen by the shared valid-only
  `selectValidWinner` (never a judge).
- **`selectValidWinner`** — the canonical best-gated-valid winner strategy
  (ungated patches never win); reused everywhere a winner is picked.

```ts
import {
  createWorktreeCliExecutor, gateOnDeliverable, patchDelivered, worktreeFanout,
} from '@tangle-network/agent-runtime/loops'
import { coderTaskToPrompt } from '@tangle-network/agent-runtime/profiles'

const executor = gateOnDeliverable(
  createWorktreeCliExecutor({
    repoRoot,
    profile,                               // the AgentProfile YOU author (systemPrompt + model)
    harness: 'claude-code',
    taskPrompt: coderTaskToPrompt(task),
  }),
  patchDelivered({ maxDiffLines: 400 }),   // the deliverable IS the gate, passed as DATA
)
```

There is no **researcher** primitive either — no researcher profile preset and
no researcher delegate interface. Research delegation rides the same generic
`delegate` MCP verb: the supervisor authors a researcher-shaped worker from the
intent ("research competitor pricing with citations"). For an owned
retrieval / corpus loop, the optional `@tangle-network/agent-knowledge` package
ships a `multiHarnessResearcherFanout` consumers can adapt directly.

### Topologies — built-in strategies + shipped combinators

`@tangle-network/agent-runtime/loops` exports the current public surface:

- **`sample`** — N independent attempts, keep the best-verifying one.
- **`refine`** — attempt, observe the trace, steer the next attempt, repeat.
- **`sampleThenRefine` / `adaptiveRefine`** — shipped mixed strategies for
  explore-then-exploit and branch-when-stuck runs.
- **`worktreeFanout(options)`** — the code-specific fanout composition: N
  profiles/harnesses in parallel worktrees, each gated by a `DeliverableSpec`,
  winner chosen by `selectValidWinner`.
- **`fanout`, `panel`, `verify`, `pipeline`, `loopUntil`, `widen`** — generic
  combinator shapes for custom agent compositions.

Deferred (NOT shipped — do not pretend they exist in adoption code):
**Council** (judge-of-judges over fanout outputs), **Decompose** (planner
splits task → subtasks → re-aggregate). When a product reaches for one, build a custom
`Driver` against the kernel's interface (`src/loops/types.ts:Driver`); do
NOT vendor a forked kernel.

### Gotchas

- `runLoop` validates `ctx.sandboxClient.create` exists or throws
  `ValidationError`. A `null` sandbox client never reaches the LLM — fail
  loud at the boundary, do not stub.
- The kernel emits `loop.started`, `loop.iteration.dispatch`,
  `loop.iteration.ended`, `loop.decision`, `loop.ended` via
  `ctx.traceEmitter`. Wire this into the same OTLP sink as the chat path
  (section 3) so loop telemetry is queryable alongside chat turns.
- `runLoop` ROUND-ROBINS across `agentRuns[]`. To compare two harnesses on
  the same task, pass two specs and read winner index from `result.winner`.
- The output adapter MUST return a typed value or throw. A `null` /
  `undefined` adapter return silently drops the iteration from scoring.

## Backends — two execution models, two resolvers (never hand-roll a factory)

`@tangle-network/agent-runtime` ships exactly two backend resolvers. Pick by
execution model; NEVER write a per-product backend factory or fake a box
around a non-box executor — the substrate already has the pieces
(`inlineSandboxClient`, the bridge executor) wired behind these:

- **Harness-in-box** (the agent runs inside a sandboxed harness) →
  `resolveSandboxClient({ backend: 'sandbox' | 'bridge' | 'router', ... })`
  from `/loops`. `'sandbox'` returns the caller's real Sandbox-backed client;
  `'bridge'` fronts a local cli-bridge harness CLI; `'router'` uses a router
  chat-completion as the leaf executor. All three return the SAME
  `SandboxClient` shape, so loop code is backend-agnostic.
- **In-process agent** (the product's own chat path, no box) →
  `resolveAgentBackend({ kind: 'router' | 'tcloud' | 'cli-bridge' | 'sandbox', ... })`
  from the package root — the one `--backend` branch for
  `runChatThroughRuntime` / `runAgentTaskStream`. Pure backend selection;
  product concerns (credit cuts, retries) wrap the returned backend.

**Run-turn streaming:** `streamAgentTurn(backend, prompt, { signal, timeoutMs })`
+ `collectAgentTurn(stream)` (`/loops`) run ONE agent turn on any
substrate — box, cli-bridge/router executor, or in-process chat backend — as
one normalized `RuntimeStreamEvent` stream with a guaranteed terminal
result+usage event. Do not write a per-provider stream→event mapper.

## MCP delegation tools — `@tangle-network/agent-runtime/mcp`

The substrate ships an in-process or stdio MCP server (`createMcpServer`, bin
`agent-runtime-mcp`) that exposes the delegation tools to any agent harness
that can mount MCP servers (Claude Code, Codex, etc.). The surface is ONE
generic `delegate` verb plus the queue-bound tools (`delegate_feedback`,
`delegation_status`, `delegation_history`); the queue-bound trio is always
served, `delegate` is opt-in. `delegate_ui_audit` is served only when a
consumer wires a `UiAuditorDelegate` at `createMcpServer` construction (the
bin does not wire one).

### The tools

Names, descriptions, and input schemas are exported verbatim from the
substrate. Use them in product system prompts unedited so the model receives
the same surface in prod and eval.

- **`delegate`** — "Delegate an INTENT to a supervisor that AUTHORS and
  drives whatever worker the intent needs. ... There is no fixed worker
  type: this ONE verb replaces separate code / research delegation. The
  supervisor picks the worker shape from your intent. ... Returns
  synchronously with the delivered result AND the real cost of the whole
  delegation (spentTotal: iterations, input/output tokens, usd, ms) ... A
  run that produced no delivered worker returns status \"no-winner\" with
  the reason; it never fabricates a success." Input is `intent` plus an
  optional per-call `model` / `runId`. The supervisor's substrate (its brain
  `router`, the worker `backend`, the completion `deliverable`) is INJECTED
  at server construction — never an agent-supplied arg.
- **`delegation_status`** — "Poll the status of an async delegation. ...
  Pass includeTrace: true to also receive the journaled loop-trace span
  tree (loop → round → iteration, with placement/cost/verdict metadata). ...
  Throws NotFoundError when taskId is unknown — never silently returns
  `pending` for a typo."
- **`delegation_history`** — "Read past delegations newest-first. ...
  Filters: `namespace` (multi-tenant scope), `profile` (\"coder\" |
  \"researcher\"), `since` (ISO date). `limit` defaults to 50, capped at
  500." Each entry carries `hasTrace`; when true, the full span tree is
  retrievable via `delegation_status { taskId, includeTrace: true }`.
- **`delegate_feedback`** — "Record feedback on a delegation, artifact, or
  outcome. Synchronous — the event is durably stored when this call returns.
  ... `refersTo.kind`: \"delegation\" | \"artifact\" | \"outcome\"."

### Mounting pattern — production AgentProfile.mcp

Compose at runtime, never declare statically in the SDK profile (the
sandbox-SDK's `AgentProfileMcpServer.env` doesn't template the
sandbox-scoped key). Reference impl from `gtm-agent/src/lib/.server/sandbox/index.ts:104`:

```ts
// AgentProfileMcpServer (and AgentProfile, HarnessType, etc.) are owned by
// @tangle-network/agent-interface — the neutral contract layer. @tangle-network/sandbox
// re-exports them for back-compat, but import from agent-interface for new code.
import type { AgentProfileMcpServer } from '@tangle-network/agent-interface'

const DELEGATION_MCP_SERVER_KEY = 'agent-runtime-delegation'

export function buildDelegationMcpServer(
  options: { sandboxApiKey?: string; sandboxBaseUrl?: string } = {},
): Record<string, AgentProfileMcpServer> | undefined {
  const sandboxApiKey = options.sandboxApiKey ?? process.env.TANGLE_API_KEY
  if (!sandboxApiKey) return undefined                           // fail closed
  return {
    [DELEGATION_MCP_SERVER_KEY]: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '--package', '@tangle-network/agent-runtime', 'agent-runtime-mcp'],
      env: {
        TANGLE_API_KEY: sandboxApiKey,
        SANDBOX_BASE_URL: options.sandboxBaseUrl ?? sandboxBaseUrl(),
        MCP_ENABLE_DELEGATE: '1',          // serve the generic `delegate` verb
      },
      enabled: true,
      metadata: {
        surface: 'delegation:dispatch',
        tools: ['delegate', 'delegate_feedback',
                'delegation_status', 'delegation_history'],
      },
    },
  }
}
```

Then merge into the per-turn `streamPrompt` profile (see
`composeProductionAgentProfile`).

### `TANGLE_API_KEY` — scope matters

Serving `delegate` requires a `TANGLE_API_KEY` that can drive
`new Sandbox({ apiKey })` — the authored workers run as sub-sandboxes through
that client. The queue-bound trio (feedback / status / history) serves with
no key.

`TANGLE_API_KEY` is the ONE all-products key (`sk-tan-…`): it drives the
sandbox AND the paid router. Do not mint or special-case per-scope keys.

When `MCP_ENABLE_DELEGATE=1` is set without a key, the bin exits 2 with a
clear message. `AGENT_RUNTIME_MCP_ALLOW_NO_KEY=1` overrides that exit for
diagnostics only.

### Worker placement — sibling sub-sandboxes vs fleet workspace

The bin's `delegate` workers run as sub-sandboxes (the `sandbox` backend)
through the SAME `SandboxClient` the bin loads from `TANGLE_API_KEY`, on the
harness named by `MCP_DELEGATE_WORKER_HARNESS`. For consumers wiring the
queue-bound delegation plumbing themselves (`createMcpServer` +
`detachedSessionDelegate`), placement is a library-level choice exported from
`@tangle-network/agent-runtime/mcp`:

- **`createSiblingSandboxExecutor`** (the `detachedSessionDelegate` default) —
  each delegation spawns a new sandbox alongside the caller's. Worker patches
  land in the worker's filesystem; the caller copies them out via the
  delegation result's `patch` field.
- **`createFleetWorkspaceExecutor`** — dispatches into the fleet's shared
  workspace. Worker diffs land directly on the caller's filesystem with
  no cross-sandbox boundary.
- **`detectExecutor({ sandboxClient })`** — resolves the choice from env:
  `TANGLE_FLEET_ID` set → fleet-workspace placement;
  `TANGLE_FLEET_EXCLUDE_MACHINES` — comma-separated machine ids to skip
  during fleet round-robin (typically the coordinator machine the MCP
  server is itself running on). Refuses to silently degrade — a fleet id
  whose handle can't resolve is an error, not a fallback to sibling mode.

### Bin env knobs (`src/mcp/bin.ts` header is the source of truth)

- `TANGLE_API_KEY` — required to serve `delegate`; passed to
  `new Sandbox({ apiKey })`.
- `SANDBOX_BASE_URL` — sandbox-SDK base URL override.
- `MCP_ENABLE_DELEGATE` — set to `1` to serve the generic `delegate` verb.
- `MCP_SUPERVISOR_MODEL` — supervisor brain model id (falls back to
  `MCP_WORKER_MODEL`, then `WORKER_MODEL`, then a default). Must be a
  tool-calling model.
- `MCP_SUPERVISOR_ROUTER_KEY` — router key for the supervisor brain
  (defaults to `TANGLE_API_KEY`).
- `MCP_SUPERVISOR_ROUTER_BASE_URL` — router base for the supervisor brain
  (defaults to the repo's `resolveRouterBaseUrl`, normalized to `/v1`).
- `MCP_DELEGATE_WORKER_HARNESS` — harness the authored workers run on
  (default `opencode`).
- `AGENT_RUNTIME_DELEGATION_STATE_FILE` — absolute path of a JSON state
  file. When set, delegation records persist across MCP restarts
  (`FileDelegationStore`): status/history survive and idempotency keys
  dedupe across processes.
- `AGENT_RUNTIME_DELEGATION_STATE_RECOVER=1` — archive a corrupt state file
  (`<file>.corrupt-<ts>`) and start empty instead of refusing to boot.
- `AGENT_RUNTIME_DELEGATION_RETAIN_TERMINAL` — positive integer cap on
  retained terminal records. Unset = keep forever.
- `OTEL_EXPORTER_OTLP_ENDPOINT` (+ `TRACE_ID` / `PARENT_SPAN_ID`) — export
  the supervisor's loop-topology spans to the OTLP / Tangle Intelligence
  sink; the same context is stamped onto every delegation record.

### When to use each tool

| Tool | Use when |
| --- | --- |
| `delegate` | You want an outcome — code fixed, a question researched with citations, a refactor — without specifying HOW. State the intent; the supervisor authors the worker, runs it on a conserved budget, and returns the delivered result + `spentTotal` synchronously. |
| `delegation_status` | Poll every minute or two while waiting on an async delegation (`delegate_ui_audit`). Never busy-poll. `includeTrace: true` for the span tree. |
| `delegation_history` | Before delegating a question you might have asked before. Feed into routing + calibration. |
| `delegate_feedback` | After you've used a delegation output and formed a judgment. Append-only — every call is a new event. |

## Production-profile reuse — the trap evals fall into

The eval MUST drive the same `AgentProfile` composer as production. If the
eval builds a parallel "eval profile" that omits the MCP servers / file
mounts / permissions block, the eval is structurally incapable of testing
delegation, tool calls, or any capability the profile gates — and the
scorecard rubric measures the gap between the toy profile and the real one,
not the agent's behaviour.

### The pattern

Export a single composer from `src/lib/.server/sandbox/` and import it from
both the chat handler AND the eval canonical runner.

```ts
// src/lib/.server/sandbox/index.ts
export function composeProductionAgentProfile(
  options: ComposeProductionAgentProfileOptions = {},
): AgentProfile {
  const delegationMcp = buildDelegationMcpServer({
    sandboxApiKey: options.sandboxApiKey,
    sandboxBaseUrl: options.sandboxBaseUrl,
  })
  // ... merge MCP, files, permissions, prompt
  return { ...baseProfile, mcp: mergedMcp, /* ... */ }
}
```

```ts
// eval/canonical.ts — DO import the production composer
import { composeProductionAgentProfile } from '../src/lib/.server/sandbox'

const profile = composeProductionAgentProfile({ sandboxApiKey: process.env.TANGLE_API_KEY })
// Pass `profile` into the sandbox client used by `runLoop` or the durable
// chat entrypoint `handleChatTurn`, never into a vanilla
// `createOpenAICompatibleBackend` — that transport posts plain
// `chat/completions` with no `tools` field; MCP tools never surface.
```

### Guard test — assert profile shape parity

Catch drift the moment the eval and production composers diverge:

```ts
// eval/profile-parity.test.ts
import { describe, it, expect } from 'vitest'
import { composeProductionAgentProfile } from '../src/lib/.server/sandbox'

describe('eval AgentProfile mirrors production', () => {
  it('mounts the delegation MCP server', () => {
    const profile = composeProductionAgentProfile({ sandboxApiKey: 'sk-tan-test' })
    expect(profile.mcp).toHaveProperty('agent-runtime-delegation')
    expect(profile.mcp?.['agent-runtime-delegation']?.metadata?.tools).toContain('delegate')
  })
  it('keeps prompt + permissions blocks from production', () => {
    const prod = composeProductionAgentProfile({ sandboxApiKey: 'sk-tan-test' })
    const evalP = composeProductionAgentProfile({ sandboxApiKey: 'sk-tan-test', name: 'eval-shadow' })
    expect(evalP.prompt.systemPrompt).toBe(prod.prompt.systemPrompt)
    expect(Object.keys(evalP.permissions ?? {}).sort()).toEqual(Object.keys(prod.permissions ?? {}).sort())
  })
})
```

### Anti-patterns

- **Parallel "eval profile"** that hand-rolls a subset of MCP servers,
  permissions, or files. The eval scorecard will diff against itself over
  time, never against production.
- **Backend transport with no tools support.** `createOpenAICompatibleBackend`
  POSTs `{ model, stream, messages }` only — no `tools` field. MCP tools
  declared in the profile never reach the LLM through this transport. If
  the eval uses it AND scores on tool-call presence, every run scores 0
  with no error. Use a backend that goes through the sandbox client
  (which respects `profile.mcp`), or build an MCP-aware backend.
- **Silently swallowed transport errors.** A 402 / 401 / 5xx from the
  router becomes a `backend_error` event in the runtime stream, which
  the chat-style harness collects but doesn't propagate to
  `result.error`. The rubric then records "agent didn't call the tool"
  when reality is "agent never reached the model." Surface backend errors
  as harness-level failures, not as zero-score scenario results.

## Product eval leaderboard — `defineLeaderboard` (the authoring entry point)

Authoring a product eval leaderboard is ONE call:
`defineLeaderboard({ name, cases, prompt, score, axis?, backends?, flags?,
setup?/teardown?, onCellEvents?, resolveModel?, export?, dispatch?, judges?,
matrix? })` from `@tangle-network/agent-runtime/loops`. The facade owns the
whole frame (the `resolveModel` seam, iteration metadata, and a generic
`TArtifact` are part of it) — do NOT hand-assemble it per product:

- the standard CLI flags: `--backend` / `--harnesses` / `--models` / `--cases`
  / `--shots` / `--reps` / `--run-dir` / `--export-dir` (plus product `flags`),
- a FRESH default run-dir per invocation (only an explicit `--run-dir` opts
  into resume, so a rerun never silently reuses a failed zero-token cell),
- the harness × model axis via `expandProfileAxes`,
- ONE `runProfileMatrix` call,
- result export + the ranked leaderboard rendering,
- `toBenchmarkAdapter()` so the same spec plugs into the bench harness.

A product writes ~150-250 domain lines: the `cases`, the `prompt` builder, and
the `score` grader. Everything else is the facade's job.

```ts
import { defineLeaderboard } from '@tangle-network/agent-runtime/loops'

const board = defineLeaderboard<TaxCase, TaxReturnArtifact>({
  name: 'taxcalc',
  cases: TAXCALC_CASES,
  prompt: (c) => buildTaxPrompt(c),
  score: (artifact, c) => gradeReturn(artifact, c),   // number | LeaderboardScore
  axis: { harnesses: ['claude-code', 'codex'] },      // omit → CODING_HARNESSES
  onCellEvents: (events, c) => captureDomainMetrics(events, c),
})
await board.run(process.argv.slice(2))
```

Two override levels, both DATA on the spec:

- **Level 1** — `parseOutput` / `onCellEvents` / `resolveModel` / `export`:
  reshape what the default dispatch produces. `resolveModel` reads the
  backend's usage/terminal events to pin the real snapshot model id for
  native-model cells (`HARNESS_NATIVE_MODEL` expansion).
- **Level 2** — `dispatch` / `judges`: full replacement. `dispatch` is how
  in-process products plug in — e.g. a product whose agent runs through
  `runChatThroughRuntime` supplies a dispatch that drives that path instead
  of a sandbox box. `judges` replaces the default `score`-wrapped judge.

`runProfileMatrix` stays public as the escape floor for shapes the facade
cannot express — but reaching for it FIRST, or re-implementing flag parsing /
run-dir management / export around it, is the anti-pattern the facade
exists to delete.

## Cross-profile matrix — `runAgentMatrix`

`@tangle-network/agent-eval/matrix` exports `runAgentMatrix` (the runner is
shipped, not just the types) plus `MatrixScenario`, `MatrixAxes`, and
`axisExtractors`. It sweeps scenarios × profiles × replicates and aggregates by
axis. Use for: cross-provider benchmarking ("does claude-sonnet-4-7 beat
deepseek-chat on persona X?"), thinking-level ablations, harness selection
("which coder harness wins on this repo?").

```ts
import type {
  MatrixScenario, RunAgentMatrixOptions,
} from '@tangle-network/agent-eval/matrix'
import { axisExtractors } from '@tangle-network/agent-eval/matrix'

const result = await runAgentMatrix({
  scenarios,                               // MatrixScenario<Task>[]
  profiles: [claudeProfile, codexProfile], // AgentProfile[] from @tangle-network/agent-interface
  runCell: async (cell, signal) => {
    // cell carries { scenario, profile, repIndex, axes }. You spawn the
    // sandbox, drive the loop, score, return { score, costUsd, output? }.
    const loopResult = await runLoop({ task: cell.scenario.task, agentRuns: [{ profile: cell.profile, harness: cell.axes.harness }], output, validator, driver, ctx: { sandboxClient, signal } })
    return { score: loopResult.winner?.verdict.score ?? 0, costUsd: loopResult.costUsd, output: loopResult.winner?.output }
  },
  axes: {
    harness: axisExtractors.harness,            // built-in
    model: axisExtractors.model,
    thinkingLevel: axisExtractors.thinkingLevel,
    persona: (profile) => profile.metadata?.persona as string | undefined,
  },
  reps: 3,
  maxConcurrency: 4,
  costCeiling: 5.0,                          // abort cleanly when cumulative cost crosses $5
})
```

### Aggregation

`result.byAxis` carries `AxisSummary[]` per axis (passRate, meanScore,
totalCostUsd, sampleSize). `result.summary` carries totals +
`costCeilingReached` + `aborted` + `skippedCells`. Use these for the
public benchmark dashboard; do NOT recompute by hand from `cells[]` —
the substrate's aggregator already handles `skipped` correctly.

### Gotchas

- `runCell` may throw; the matrix captures throws as `CellResult.error`
  WITHOUT aborting the rest of the run. Partial completion is observable
  via `summary.skippedCells`.
- `costCeiling` is a soft abort — in-flight cells finish; new ones don't
  start. Set it conservatively for paid-backend matrices.
- `signal` propagates a child `AbortSignal` into your `runCell`; honour
  it or the matrix can't abort cleanly.

### Harness × model as a first-class axis — `expandProfileAxes` + `runProfileMatrix`

The harness (`opencode` / `claude-code` / `codex` / `kimi-code`) and the model
are ONE eval axis, generated from a single base domain profile — NOT a list each
product re-declares. `defineLeaderboard` drives this whole axis for you; use
the primitives below directly only when working underneath the facade.
`@tangle-network/agent-eval` owns the axis:

- **`CODING_HARNESSES`** — the single canonical harness list. Import it; never
  re-declare a local `HARNESSES` / `HarnessBackend` array in a product.
- **`expandProfileAxes({ base, harnesses?, models? }) → AgentProfile[]`** —
  generates the harness × model sweep from one base `AgentProfile`. Omit
  `harnesses` / `models` and it expands to `CODING_HARNESSES × the base model`
  (the "turn it on for every harness/model" switch). `harnessSupportsModel`
  filters per harness, and a vendor-locked harness that supports NONE of the
  requested models SNAPS to its native default (`HARNESS_NATIVE_MODEL`) —
  it is never silently dropped from the sweep. You never hand-filter.
- **`runProfileMatrix({ profiles, scenarios, dispatch, judges })`** — runs that
  profile set and stamps a harness/model-aware `AgentProfileCell` on every
  `RunRecord`. Harness is carried at the record layer, not smuggled in metadata.
- **`groupRunsByAgentProfileCell(result.records)`** — the ONE way to pivot the
  result by harness / model. Do NOT read `metadata.harness` by hand and do NOT
  recompute a join key.

```ts
import {
  CODING_HARNESSES, expandProfileAxes, groupRunsByAgentProfileCell,
  runProfileMatrix,
} from '@tangle-network/agent-eval'

const profiles = expandProfileAxes({
  base: composeProductionAgentProfile(),   // one domain profile
  harnesses: CODING_HARNESSES,             // omit → every canonical harness
  // models omitted → the base model only
})

const result = await runProfileMatrix({ profiles, scenarios, dispatch, judges })

for (const [cell, runs] of groupRunsByAgentProfileCell(result.records)) {
  // `cell` is harness/model aware — pivot the leaderboard by it
}
```

Harness is NOT a field on the neutral `AgentProfile` (agent-interface) — it is a
RUN-layer / executor coordinate. `expandProfileAxes` stamps it onto each
generated profile's cell, the loop carries it in the `{ profile, harness }` run
spec, and the executor-overridable brain preference lives on agent-runtime's
`SupervisorProfile.harness` (`null` → the in-process router brain; a coding-CLI
harness → a sandboxed harness drives the coordination) and
`ImproveCodeOptions.harness`. `harnessAxisOf(profile)` reads the generator's
stamp when you need the harness off a single profile. The SAME
`expandProfileAxes(...)` output feeds both the product self-improve loop
(`selfImprove`) AND the research leaderboard — one axis, both uses.

**Anti-patterns:**

- **Local harness list.** A per-product `HARNESSES` / `HarnessBackend` array.
  Import `CODING_HARNESSES` — the list lives in one place and grows there.
- **Harness in metadata + a bespoke reader.** Stuffing the harness into
  `metadata.harness` and grouping with a hand-rolled helper. Use the stamped
  `AgentProfileCell` + `groupRunsByAgentProfileCell` — the recompute-the-join-key
  path was the bug.
- **Harness baked into the model id.** Encoding `claude-code/claude-sonnet` as a
  single model string so the same model can't run under multiple harnesses.
  Harness and model are orthogonal coordinates; keep them separate on the cell.

## Live trace flow — the production-to-evolution pipeline

The same trace surface a chat turn emits is the substrate the analyst loop
and improvement loop consume. Wire once; every flow downstream is free.

```txt
runLoop / handleChatTurn
  └─ SandboxEvent stream (text_delta / tool_call / tool_result / artifact)
       └─ output.parse(events)        — typed Output (CoderOutput, research items, chat finalText)
            └─ validator.validate     — DefaultVerdict { score, valid, error? }
                 └─ trace events       — LoopTraceEvent + RuntimeStreamEvent
                      └─ ingestion mount — TraceSource → OTLP + RunRecord
                           └─ .production-data/traces/events.ndjson
                                └─ analyst pass — AnalystRegistry.run → FindingsStore
                                     └─ improvement-loop — held-out gate + re-eval
                                          └─ ship — optional auto-PR
```

Every arrow is a substrate seam, not a product hand-roll. Skipping any
link breaks the loop closure — see "Bug classes the substrate now
prevents" below.

## 1. `defineAgent` manifest

One declarative file names every mutable surface the self-improvement loop is
allowed to touch, plus the rubric vocabulary the analyst loop scores against.
The substrate validates every surface against disk at module load —
`AgentManifestError` lists the offenders, so a misconfigured manifest fails at
startup, not at the first finding.

`creative-agent/eval/agent.config.ts:32`:

```ts
import { DEFAULT_TRACE_ANALYST_KINDS } from '@tangle-network/agent-eval'
import { defineAgent } from '@tangle-network/agent-runtime/agent'

export const creativeAgent = defineAgent({
  id: 'creative-agent',
  repoRoot: REPO_ROOT,
  surfaces: {
    systemPrompt: 'src/lib/.server/agent-prompt/skills',
    tools: 'tools',
    rubric: 'eval/lib/creative-rubric.ts',
    knowledge: '.agent-knowledge',
    personas: 'eval/scenarios',
  },
  rubric: { dimensions: [/* {id, weight, score} per dimension */] },
  runtime: { act: async () => { throw new Error('use canonical-runner.ts') } },
  personas: async () => [],
  analystKinds: DEFAULT_TRACE_ANALYST_KINDS,
  analyst: {
    model: process.env.ANALYST_MODEL ?? 'claude-haiku-4-5',
    backend: { apiKey: process.env.TANGLE_API_KEY ?? '', baseUrl: process.env.TANGLE_ROUTER_URL ?? 'https://router.tangle.tools/v1' },
  },
  autoApply: {
    knowledge:   { enabled: true, confidenceThreshold: 0.85, mode: 'write' },
    improvement: { enabled: true, confidenceThreshold: 0.90, mode: 'open-pr' },
  },
})
```

Cross-vertical references (same shape, different surface paths):
`tax-agent/tests/eval/agent.config.ts:33`,
`legal-agent/tests/eval/agent.config.ts`,
`gtm-agent/eval/agent.config.ts`.

### Gotchas

- `repoRoot` must be ESM-safe (`dirname(fileURLToPath(import.meta.url))`) or
  CJS-safe (`resolve(__dirname, '..')`), whichever the package emits. A wrong
  base path fails surface validation on first load.
- `runtime.act` MUST throw with a message pointing to the canonical runner
  unless you actually wire the substrate's re-run path. A silent stub turns
  outcome-measurement into a no-op.
- Don't omit `analystKinds` to "default it later" — the loop probes
  `manifest.analystKinds`; an empty array means zero findings.

## 2. Analyst pass (`AnalystRegistry` + `FindingsStore`)

Capture is half the system. The other half is consumption: every run must
produce *durable findings* (not prose), diff against the prior run, and
propose mutations to either the knowledge base or a mutable surface (system
prompt, tool docs, rubric, personas).

`creative-agent/eval/analyst-loop.ts:121`:

```ts
import {
  AnalystRegistry, DEFAULT_TRACE_ANALYST_KINDS,
  FindingsStore, createTraceAnalystKind,
} from '@tangle-network/agent-eval/analyst'
import { OtlpFileTraceStore } from '@tangle-network/agent-eval/traces'

const registry = new AnalystRegistry({ chat, log })
for (const spec of creativeAgent.analystKinds) {
  registry.register(createTraceAnalystKind(spec, { ai, model }))
}
const findingsStore = new FindingsStore('.evolve/findings/findings.jsonl')
const traceStore   = new OtlpFileTraceStore({ path: `${runDir}/otlp-spans.jsonl` })

const result = await registry.run(runId, { traceStore }, {
  budget: { totalUsd: 1.50 },
  tags: { commit, surface: creativeAgent.id },
})
await findingsStore.append(runId, result.findings)

// Then route result.findings through the product's knowledge/surface adapters.
```

### Subject grammar — load-bearing

Each finding carries a typed `FindingSubject` (Zod-enforced). The substrate's
adapters route on `subject.kind`. A finding whose subject doesn't match a
recognised kind lands in `skipped` and never produces a mutation.

| `subject.kind`                                    | Adapter             | Effect                                          |
| ------------------------------------------------- | ------------------- | ----------------------------------------------- |
| `knowledge.wiki` / `knowledge.claim` / `.raw` / `.stale` | KnowledgeAdapter    | write `.agent-knowledge/<slug>.md` etc.         |
| `system-prompt` (with `section`)                  | ImprovementAdapter  | draft patch against `surfaces.systemPrompt`     |
| `tool-doc` (with `tool`)                          | ImprovementAdapter  | draft patch against `surfaces.tools`            |
| `rubric` (with `dimension`)                       | ImprovementAdapter  | draft patch against `surfaces.rubric`           |
| `persona` (with personaId)                        | ImprovementAdapter  | draft patch against `surfaces.personas`         |
| `cluster`                                         | (evidence only)     | counted; no mutation                            |

### Gotchas

- **One ledger per product, in the repo**: `.evolve/findings/findings.jsonl`.
  Cross-run diffs (`appeared` / `disappeared` / `persisted` / `changed`)
  compute against the previous `run_id` automatically. Markdown notes break
  this — keep findings machine-queryable.
- **Auto-apply knowledge, withhold improvement** until the producer's
  precision is measured. Knowledge writes are `git revert`-able; prompt /
  rubric / tool edits change agent behaviour and want operator review via PR.
- **OTLP path is canonical**. The canonical runner emits
  `<runDir>/otlp-spans.jsonl` during its trace-analyst step. Reading anything
  else is a redundant projection. If the file is empty, exit cleanly — don't
  fabricate spans.
- The `draftPatch` callback returns an empty patch when no actionable edit
  is warranted. The substrate counts that as a soft skip — do not throw.

## 3. Production trace source

Every production chat session must expose the same tool-call trace shape that
eval, analyst, and improvement loops consume. Current runtime packages use the
`TraceSource` family, not the old production-sink symbols.

```ts
import {
  createPushTraceSource,
  sandboxSessionTraceSource,
  type SessionTraceBox,
  type TraceSource,
} from '@tangle-network/agent-runtime/loops'

export function ownedLoopTraceSource(runId: string) {
  return createPushTraceSource({ runId })
}

export function sandboxTraceSource(
  box: SessionTraceBox,
  sessionId: string,
  harness: string,
): TraceSource {
  return sandboxSessionTraceSource(box, sessionId, { harness })
}
```

Owned loops call `record(...)` on the returned push source as tools execute.
Sandbox or fleet runs collect spans from session parts at settle time. The
same persisted span stream feeds analyst findings and the improvement loop.

### Gotchas

- Do not copy old examples that import `createProductionTraceSink` or
  `ProductionTraceSink`; the current `@tangle-network/agent-runtime` package
  does not expose those names.
- Owned tool loops must record spans at dispatch time; sandbox loops must
  collect session parts before teardown.
- Trace export failures must not fail the user path. Persist the run record
  and warn on telemetry forwarding failure.

### Adjacent surface — `@tangle-network/agent-runtime/intelligence`

The product-facing observe + delivery layer lives at
`@tangle-network/agent-runtime/intelligence`: `withTangleIntelligence(agent, config)`
wraps a produce function (effort tiers `off | eco | standard | thorough | max`),
and `pullCertified` / `withCertifiedDelivery` fold the certified composed
profile from `GET {TANGLE_INTELLIGENCE_URL | https://intelligence.tangle.tools}/v1/profiles/:target/composed`
(Bearer `TANGLE_API_KEY`; 5-minute refresh; fail-closed — a network error or
non-2xx falls back to the base surface, never throws). The export leg needs
`INTELLIGENCE_OTLP_ENDPOINT` (or `OTEL_EXPORTER_OTLP_ENDPOINT`); absent, export
is a silent no-op — `doctor().exportConfigured` reveals it. The default
redactor scrubs keys matching `session[-_]?(id|token)` from exported input, so
session identity rides `TraceMeta.labels`, not input fields. Dashboard
visibility at intelligence.tangle.tools is tenant-scoped by the
`TANGLE_API_KEY` owner (the operator/team, not the product's end users).
Wiring this into a product is `agent-stack-adoption`'s intelligence phase, not
this skill's scope.

## 4. `assertRealBackend` + `enforceBackendIntegrity` guard — **the Phase A insight**

This is the headline bug class the substrate now prevents. Without it, your
eval can run completely blind — zero LLM calls, every persona returning a
stub — and the ship-gate happily reports 0/N as "agent regression." You then
deploy a "fix" against the imaginary regression and you've shipped real
damage.

Mechanism: every `RunRecord` carries `tokenUsage.input` / `.output`. When all
records are zero, no backend was ever called. `assertRealBackend(records)`
throws `BackendIntegrityError` on verdict `'stub'`. `'mixed'` is allowed
through — partial failure is informative but not blind.

Wire it AFTER `RunRecord[]` is built, BEFORE the ship-gate. Default ON.
Opt-out only for synthetic-record tests via `EVAL_SKIP_BACKEND_INTEGRITY=1`
or `skipFlag=true`.

`legal-agent/tests/eval/lib/backend-integrity.ts:45`:

```ts
import {
  assertRealBackend, BackendIntegrityError, summarizeBackendIntegrity,
  type BackendIntegrityReport, type RunRecord,
} from '@tangle-network/agent-eval'

export function enforceBackendIntegrity(
  records: ReadonlyArray<RunRecord>,
  skipFlag?: boolean,
  env: NodeJS.ProcessEnv = process.env,
): BackendIntegrityReport | null {
  if (skipFlag || env.EVAL_SKIP_BACKEND_INTEGRITY === '1') return null
  if (records.length === 0) return null
  const report = summarizeBackendIntegrity(records)
  assertRealBackend(records)   // throws on 'stub'
  return report
}
```

Call site (`creative-agent/eval/canonical-runner.ts:348`):

```ts
let integrityReport: BackendIntegrityReport | null = null
try {
  integrityReport = enforceBackendIntegrity(records, opts.skipBackendIntegrity)
} catch (err) {
  if (err instanceof BackendIntegrityError) {
    writeFileSync(resolvePath(artifactDir, 'backend-integrity.json'),
      JSON.stringify({ runId, scoredAt: new Date().toISOString(), report: err.report }, null, 2))
  }
  throw err   // skip the ship-gate — there is no agent signal to gate on
}
```

### Gotchas

- **Throw BEFORE the ship-gate runs.** A blind run has zero signal; running
  the gate on it pollutes the scorecard with a fake "everything regressed"
  baseline that later real runs will be diffed against.
- **Always persist `backend-integrity.json`** on both the success and the
  throw path. The post-mortem bundle needs the diagnosis when an operator
  asks "why did nightly fail at 02:14 UTC."
- Reference PRs that wired this: `creative-agent#147`, `tax-agent#91`,
  `gtm-agent#145`, `legal-agent#98`.

## 5. Scorecard wiring — `agentProfileHash` + `recordRunsToScorecard`

A single eval pass cannot tell you "did this commit regress persona X on this
profile" — only "did this run pass." The scorecard is an append-only JSONL
log keyed by `(scenarioId × profileHash)`; each line is one run on one cell.
`loadScorecard` + `diffScorecard` answer the regression question with a
Welch's t-test on the latest entries vs their predecessors.

`creative-agent/eval/scorecard-integration.ts:38`:

```ts
import {
  agentProfileHash, diffScorecard, formatScorecardDiff, loadScorecard,
  recordRunsToScorecard, type AgentProfile, type RunRecord, type ScorecardDiff,
} from '@tangle-network/agent-eval'

// NOTE: this `AgentProfile` is agent-eval's NARROW scorecard-key type
// ({ model, skills, tools, promptVersion, metadata } — behaviour-only, the hash key).
// It is DISTINCT from the harness `AgentProfile` owned by @tangle-network/agent-interface
// (prompt + skills + tools + mcp + subagents + permissions). Don't conflate the two.

export function buildScorecardAgentProfile(model: string): AgentProfile {
  const skills = Object.keys(creativeAgentProfile.subagents ?? {}).sort()
  const tools  = Object.entries(creativeAgentProfile.tools ?? {})
                  .filter(([, on]) => on === true).map(([id]) => id).sort()
  return {
    id: `${creativeAgentProfile.name}@v${creativeAgentProfile.version}/${model}`,
    model, skills, tools,
    promptVersion: `production-loop-addendum/v${addendumVersion}`,
    metadata: { profileName: creativeAgentProfile.name, profileVersion: creativeAgentProfile.version },
  }
}

export function recordScorecardAndDiff(input: ScorecardWiringInput): ScorecardWiringResult {
  const lines     = recordRunsToScorecard(input.scorecardPath, input.runs, { profile: input.profile, commitSha: input.commitSha })
  const scorecard = loadScorecard(input.scorecardPath)
  const diff      = diffScorecard(scorecard)
  return {
    appendedCells: lines.length,
    profileHash:   agentProfileHash(input.profile),
    diff, formatted: formatScorecardDiff(diff),
    regressed:     diff.cells.some((c) => c.verdict === 'regressed'),
  }
}
```

CLI flag: `--fail-on-regression` (or `EVAL_FAIL_ON_REGRESSION=1`) flips the
diff from informational to a hard CI gate.

Same shape in `tax-agent/tests/eval/lib/scorecard-integration.ts`,
`legal-agent/tests/eval/lib/scorecard-integration.ts`,
`gtm-agent/eval/scorecard-integration.ts`.

### Gotchas

- **`id` is excluded from `agentProfileHash`.** Human-facing only. The hash
  covers `{ model, skills, tools, promptVersion, metadata }`.
- **Sort `skills` and `tools`** before constructing the profile. Re-ordering
  inside the source profile would otherwise move the hash and split the
  timeline.
- **Welch's t-test NaN trap** — `diffScorecard` calls a cell `regressed` only
  when `|Cohen's d| ≥ minEffect AND p ≤ maxP`. With identical seeds /
  identical scores variance is zero, `p = NaN`, and every move silently
  shows `flat`. Real eval scoring already has variance; tests must seed
  per-rep variance explicitly. See
  `tax-agent/tests/eval/scorecard-wiring.test.ts:117`.
- **The JSONL is checked into the repo** at `eval/.scorecard.jsonl` (or
  `tests/eval/.scorecard.jsonl`). Don't gitignore it — that's the
  multi-commit history the diff reads from.
- Reference PRs: `creative-agent#145`, `tax-agent#90`, `gtm-agent#144`,
  `legal-agent#97`.

## 6. Per-run `AgentProfileCell` — `buildAgentProfileCell` / `buildSandboxAgentProfileCell`

Coexists with the scorecard profile; do not conflate them. The scorecard's
`AgentProfile` is the behaviour-only key whose hash is stable across runs.
The `AgentProfileCell` is stamped per-`RunRecord` and carries the run-time
identity: harness id+version, model, prompt hash, backend label, persona
suite. Use it to filter scorecard cells by harness or backend after the
fact. `runProfileMatrix` stamps this cell on every `RunRecord` for you; pivot
the records with `groupRunsByAgentProfileCell(result.records)` — never read
`metadata.harness` by hand or recompute a join key.

`creative-agent/eval/agent-profile-cell.ts:1`:

```ts
import { buildAgentProfileCell, type AgentProfileCell, type AgentProfileJson } from '@tangle-network/agent-eval'

export async function buildCreativeAgentProfileCell(args: {
  harnessVersion: string; model: string; promptHash: string;
  backend: string; personaSuite: string;
}): Promise<AgentProfileCell> {
  return buildAgentProfileCell({
    profileId:     `${creativeAgentProfile.name}@${creativeAgentProfile.version}`,
    sourceProfile: { kind: 'sandbox-agent-profile', profile: toAgentProfileJson(creativeAgentProfile) },
    harness:       { id: 'creative-agent-canonical-eval', version: args.harnessVersion },
    model: args.model, promptHash: args.promptHash,
    dimensions:    { backend: args.backend, personaSuite: args.personaSuite },
  })
}
```

For products consuming a sandbox-SDK `AgentProfile` directly, use the
short-circuit `buildSandboxAgentProfileCell(profile, { harness, model,
promptHash, dimensions })` (`@tangle-network/agent-eval`) — it
hard-codes the `sandbox-agent-profile` kind and the JSON canonicalization.

### Gotchas

- Both helpers throw `AgentProfileCellValidationError` on a profile missing
  `name` / `version`. Do not swallow it; the cell IS the run's identity and
  a fabricated default corrupts every downstream join.
- Stamp the cell onto every `RunRecord.agentProfile` field before
  `recordRunsToScorecard` reads them. The scorecard composes — it does not
  fabricate cells from a missing field.

## 7. Held-out promotion gate + `runImprovementLoop`

`runImprovementLoop` ties train/dev optimization → held-out scoring →
release-confidence gate → optional auto-PR into one call. Use
`runOptimization` only when you need the inner search body without promotion.

Skeleton:

```ts
import {
  runImprovementLoop,
  type MutableSurface,
  type RunImprovementLoopResult,
  type Scenario,
} from '@tangle-network/agent-eval/campaign'

const result: RunImprovementLoopResult<Artifact, Scenario> =
  await runImprovementLoop<Scenario, Artifact>({
    runId,
    runDir,
    scenarios: trainScenarios,
    holdoutScenarios,
    baselineSurface: BASELINE_PROMPT_ADDENDUM,
    dispatchWithSurface,
    judges,
    proposer,
    gate,
    populationSize: 3,
    maxGenerations: 2,
    autoOnPromote: process.env.GITHUB_TOKEN ? 'pr' : 'none',
    ghOwner: 'tangle-network',
    ghRepo: 'creative-agent',
    renderPromotedDiff: (winner: MutableSurface, baseline: MutableSurface) =>
      renderPromptAddendumDiff(winner, baseline),
})
```

The train and holdout scenario ids must be disjoint. `runImprovementLoop`
fails before rollout if the optimizer can see a scenario that later gates
promotion.

### The gate — ships on the MEAN paired delta, tie-robust

When you pass no `gate`, `runImprovementLoop` uses `defaultProductionGate`.
It composes held-out significance + a per-dimension anti-Goodhart regression
guard + red-team + reward-hacking + canary + budget into one `Gate.decide`.
For held-out significance as ONE of N composed gates instead of the full stack,
use `heldOutGate` and `composeGate`. Both gates, plus their statistical core
(`heldoutSignificance` + `pairHoldout`), are exported from `/contract` and
`/campaign`.

### `neutralizationGate` — did the CONTENT cause the lift, or the footprint?

A held-out gate proves a candidate beat baseline; it CANNOT prove the lift came
from the candidate's CONTENT rather than from the extra prompt/mount FOOTPRINT
that content added (more bytes, a longer prompt). `neutralizationGate`
(`@tangle-network/agent-eval/campaign`, new in 0.107.0) closes that hole: it
compares the candidate's held-out lift against the lift of a FOOTPRINT-MATCHED
neutralized variant (same layout + length, zero content, via `neutralizeText`).
If the neutralized placebo reproduces more than `maxDecorativeFraction`
(default 0.5) of the candidate's lift, the lift is decorative and the candidate
is HELD regardless of how large or significant its raw lift is. Compose it AFTER
the significance gate — significance says the lift is real, this says the
content CAUSED it:

    composeGate(heldOutGate({ ... }), neutralizationGate({ scenarios }))

It requires `ctx.neutralizedJudgeScores`, populated ONLY when `runImprovementLoop`
is given a `neutralize` fn (`runImprovementLoop({ ..., neutralize })`); a gate
composed without that wiring fails loud rather than silently passing an
unproven candidate.

Both ship on the **mean paired-delta bootstrap CI lower bound**, not a point
estimate and not the median. `defaultProductionGate` options:

- `holdoutScenarios` — the held-out set (required).
- `deltaThreshold` — the minimum lift the **CI lower bound** must clear, in the
  judge's native composite scale. Default 0. This is a confidence bound, not a
  point estimate.
- `heldoutStatistic` — the ship statistic. Default `'mean'` (tie-robust). Pass
  `'median'` only for outlier-robustness, and only when you understand you are
  trading it for tie-blindness.
- `minProductiveRuns` — below this many paired holdout observations the gate
  HOLDS with `few_runs` rather than reading a degenerate CI. Default 3.
- `criticalDimensions` / `regressionTolerance` — dimensions that must not
  significantly regress even when the net composite rises.
- `budgetUsd`, `redTeamBattery`, `recentRuns`, `blockOnRewardHackingGaming` —
  the safety + spend guards.

Every gate result reports `deltaMean`, `deltaMedianDiagnostic`, and
`tieFraction`. **The median is a reported diagnostic only.** Why the mean is the
ship statistic: once holdout scenarios saturate, most paired cells tie (baseline
and every candidate score identically), the tie fraction climbs, and the median
paired delta pins to 0 — so a median gate HOLDS a genuinely-better candidate. A
real +0.18 lift at ~50% ties reads as median 0 and never ships. The mean paired
delta still moves with the non-tied cells, so the mean gate ships the real lift
while `tieFraction` (warned above `TIE_WARN_FRACTION`) tells you the holdout is
saturating.

The legacy `HeldOutGate` CLASS (root-only export, options
`pairedDeltaThreshold` / `overfitGapThreshold`) ships on the MEDIAN paired
delta and is the exact tie-domination gate above. It still compiles for
back-compat but is NOT the adoption path and is absent from `/contract` and
`/campaign`. Wire `defaultProductionGate` / `heldOutGate`, not the class.

### Carrier — WHERE you deliver the content decides if a small model reads it

`neutralizationGate` proves the content, not the footprint, caused the lift. The
prior question it does not answer: was the content ever READ? For small models
the delivery surface — the carrier — dominates that, and the wrong carrier reads
as "the knowledge didn't help" when the model simply never opened it. Measured
on crit-create/EOPS with deepseek-v4-flash: the SAME authored fix scores 0.00 as
a mounted `resources.files` doc the model never chooses to open, versus 0.625
when delivered on the tool/function schema in the tools-list that the harness
auto-reads on every turn — +0.54 over a 0.083 baseline. Deliberately-wrong
content on that same carrier collapses to 0.25, which is the content-causality
control: the carrier alone is not carrying it, the correct content is. So for
small models prefer the tool/MCP schema carrier over `resources.files`, make the
carrier an explicit choice in the AgentProfile rather than a default, and still
compose `neutralizationGate` to prove the authored content — not its mere
presence on a read carrier — earned the lift.

### `powerPreflight` — can this budget even see the lift?

Before you spend a search, `powerPreflight({ baselineComposites, pairedN?,
deltaThreshold?, sharedScorerChannel? })` (`/campaign`) computes the
minimum-detectable-lift from the baseline holdout composites' variance
(`MDE = deltaThreshold + z·√2·sd/√n`). If the MDE is larger than any lift a
prompt change plausibly produces, the run is structurally unable to ship no
matter how good the proposer is — the budget only re-learns what a 30-second
calculation on the baseline cells already knew. `selfImprove` attaches a
`PowerPreflight` to every result and warns when a run was structurally
underpowered. Caveat carried in the result: when the holdout is scored by the
SAME judge family as the gate (`sharedScorerChannel: true`), the MDE is a lower
bound — more cells cannot buy back systematic judge bias, only an independent
second scoring channel can.

### Build a holdout with power — `scoreDiscrimination` / `selectDiscriminative`

Adding holdout scenarios for "power" backfires if they are saturated ties — a
tie wastes a paired cell and drags the tie fraction up. `scoreDiscrimination`
ranks scenarios by how well they separate candidates (variance of the candidate
scores, headroom breaking ties); `selectDiscriminative(signals, k)` picks the
top-`k` most discriminative scenario ids and drops fully saturated ties when
enough non-tied scenarios exist. Use it to CHOOSE the holdout set by signal
instead of hand-curating 5-10 scenarios that may not separate anything.

### Gotchas

- **The gate is fail-closed.** The composed default holds unless held-out
  significance AND every safety/budget/dimension check passes. A "promote when
  better than baseline" without a CI lower bound is a regression vector.
- **The loop optimizes the `MutableSurface` you give it.** With
  `baselineSurface: BASELINE_PROMPT_ADDENDUM` it rewrites the prompt addendum.
  Whether static skills or code are also loop-owned is a product policy choice,
  not a substrate limit — the `improve()` verb (below) targets `'skills'` and
  `'code'` surfaces through the same held-out gate.
- **Rendered prompt diffs must produce syntactically valid TS modules** —
  the auto-PR helper commits the rendered change verbatim. Round-trip the result
  through `tsc --noEmit` in tests.
- Validate `llm` transport carries an `apiKey` / `bearer` / `authHeader`
  before calling. Falling back to the free router for paid judge calls is
  a footgun; throw `ValidationError`.

## `improve()` — the pluggable RSI verb

`improve(profile, findings, opts)` (`@tangle-network/agent-runtime` root) is the
ONE public self-improvement verb — a facade over agent-eval's `selfImprove` that
runs the held-out-gated closed loop and returns `{ profile, shipped, lift }`.
Pick the lever with `opts.surface`
(`'prompt' | 'skills' | 'tools' | 'mcp' | 'hooks' | 'code'`, default `'prompt'`):

- `'prompt'` — `gepaProposer` mutates `profile.prompt.systemPrompt`. Zero extra
  config.
- `'skills'` — `skillOptProposer` optimizes a skill DOCUMENT. The profile's
  `skills` refs are file pointers a document-patcher cannot edit, so you pass the
  document text and a persister: `opts.skills: ImproveSkillsOptions { document,
  writeBack }`. `writeBack(winnerDocument)` fires only on a ship verdict.
- `'code'` — the real coding tier: the facade assembles git worktrees driven by
  a coding harness with a `verify` gate. `opts.code: ImproveCodeOptions {
  repoRoot, baseRef?, worktreeDir?, harness?, verify?, timeoutMs?, generator? }`.
  Without `code` or a caller-supplied `generator` it FAILS LOUD — there is no
  safe zero-config repo to invent.

Every surface ships only through the same held-out gate; `improve` never
promotes an ungated candidate.

## Multi-track improvement — the Lineage DAG

Single-track `runImprovementLoop` improves one lineage. The Lineage DAG is the
layer above it: a git-graph of improvement candidates with multi-parent merges
and visioned tracks, driven by an agent-managed governor that decides
extend / branch / merge / prune / stop. From `@tangle-network/agent-eval/campaign`:

- **`Lineage`** + **`runLineage`** — the DAG structure and its engine, with two
  abstract seams (`step`, `merge`).
- **`runLineageLoop`** — the preset that wires those seams to the REAL
  improvement machinery (one small proposer generation per step; a GEPA
  crossover on `merge`), so the DAG runs against a live proposer + scorer. Per
  step the budget is intentionally small (one generation) — the governor
  controls BREADTH across steps, not depth within one.
- **`heuristicGovernor`** (default) / **`callbackGovernor`** — the decide-next-op
  layer; `callbackGovernor` hands the decision to your own function.
- **`fsLineageStore`** / **`memLineageStore`** — durable vs in-memory DAG
  persistence.

## 8. `runEvalCampaign` — variant × scenario × seed sweeps

When you need to compare multiple candidate variants over the same scenarios
with paired statistics, use `runEvalCampaign` (`@tangle-network/agent-eval`).
Single-variant nightly runs do not need it — they turn their `RunRecord[]`
into an `InsightReport` (paired-bootstrap lift, judge stats, failure clusters)
via `analyzeRuns()` from `@tangle-network/agent-eval/contract`, the current
run-analysis entry point.

Validate: throws on empty variants, empty scenarios, duplicate variant ids,
duplicate scenarioIds. Treat those as authoring errors and fix the caller.

## 9. CI workflow integration

Two workflows live under `.github/workflows/`:

- `nightly-eval.yml` — daily at 02:00 UTC, runs the full persona corpus on
  the configured backend (`tcloud` on `self-hosted, staging-runner` is the
  shipped default; GitHub-hosted cannot reach `cli-bridge`). Uploads
  `eval/.runs/<runId>/` as an artifact. Optional Sunday 03:00 UTC
  `eval:evolve` cron when `package.json` defines that script. Reference:
  `creative-agent/.github/workflows/nightly-eval.yml`,
  `tax-agent/.github/workflows/nightly-eval.yml`,
  `legal-agent/.github/workflows/nightly-eval.yml`.
- `production-loop.yml` — weekly held-out promotion cycle. Mondays 06:00
  UTC. Needs `TANGLE_API_KEY` + `GH_AUTO_PR_TOKEN` (falls back to
  `GITHUB_TOKEN`). Calls `pnpm eval:production-loop` with optional
  `--dry-run`. Reference: `tax-agent/.github/workflows/production-loop.yml`.

### Gotchas

- `runs-on: [self-hosted, staging-runner]` is the canonical label. The
  `tcloud` backend requires this; do not silently switch to
  `ubuntu-latest`.
- `concurrency.cancel-in-progress: false` — the two crons can land on the
  same SHA; cancelling the earlier one corrupts the scorecard append order.
- `permissions: { contents: write, issues: write, pull-requests: write }` —
  the auto-PR + regression-issue flows need all three. A scoped-down token
  silently no-ops.

# Bug classes the substrate now prevents

These are the lessons the canonical patterns above encode. An adoption that
omits any one of them is shipping the bug class it prevents:

1. **Blind evals masquerading as agent collapse.** Without
   `assertRealBackend`, a router 401 / config typo / missing env returns
   zero-token responses for every persona. The ship-gate reads 0/N and
   reports "agent regressed" — and any "fix" you ship is against an
   imaginary regression. The Phase A insight: **the eval cannot trust its
   own conclusions without a backend integrity check**. Make this guard the
   first line that runs against `RunRecord[]`.
2. **Per-run pass/fail blind to multi-commit regressions.** Without the
   scorecard, you have no `(scenario × profileHash)` timeline. A commit that
   degrades persona X by 30pp passes its individual ship-gate if the
   composite is still above threshold. Welch's-t over the scorecard catches
   the persona-level regression.
3. **Hash drift from un-sorted skills / tools.** Re-ordering inside the
   source profile changes the hash. The timeline splits. The diff sees
   "new cell" everywhere and silently passes. Sort before hashing.
4. **NaN-p `flat` verdicts on identical-seed tests.** Test fixtures that
   reuse the same score across reps produce zero variance, `p = NaN`, and
   no cell ever shows `regressed`. The scorecard's CI gate appears to work
   in tests and fails in production. Seed per-rep variance.
5. **Stub `runtime.act` swallowed by outcome-measurement.** A manifest
   that returns `undefined` from `runtime.act` instead of throwing makes
   the substrate's outcome-measurement step return zero score deltas
   silently — every improvement looks neutral. Throw with a pointer to the
   real runner.
6. **Subject-grammar drift silencing analysts.** A finding whose `subject`
   doesn't match a registered `FindingSubject.kind` lands in `skipped`. If
   you bump an analyst's prompt version without rerunning the subject Zod
   tests, the loop runs, prints "0 findings", and shows green.
7. **Auto-applied improvement adapters without precision data.** Mutating
   the system prompt without operator review propagates analyst false
   positives directly into agent behaviour. Default
   `autoApply.improvement.mode = 'open-pr'` and flip to `'write'` only
   after measuring producer precision.
8. **Trace export throwing into the user path.** A misconfigured OTLP
   endpoint must NEVER surface to the chat user. Trace export catches and
   warns; do not wrap it with code that re-throws.
9. **`renderPromptFile` emitting invalid TS.** The production-loop commits
   the rendered file verbatim. A missing closing brace ships a broken
   main. Round-trip every renderer through `tsc --noEmit` in tests.
10. **Eval backend lacks MCP tool support.** `createOpenAICompatibleBackend`
    POSTs `{ model, stream, messages }` only — no `tools`. An eval that
    scores on `delegate` tool_call presence
    through this transport scores 0 with `error: null` on every run. The
    fix is "use the sandbox client that respects `profile.mcp`," not
    "tweak the rubric."
11. **Parallel eval AgentProfile drifting from production.** A
    hand-rolled `evalAgentProfile` that omits the MCP servers (or
    permissions, or file mounts, or system prompt) makes the eval
    structurally incapable of testing the capabilities production gates
    on. The scorecard timeline then tracks drift between the two
    profiles, not agent behaviour. Import the production composer; add a
    guard test on shape parity.
12. **Silent transport failure becomes "agent didn't delegate."** A 402 /
    401 / 5xx from the router lands in the stream as `backend_error`,
    not as a thrown exception. A harness that drains the stream and
    treats stream-end as success records `toolCalls: []` + `finalText:
    ''` + `error: null` and the rubric reports "agent regression." The
    operator has no signal pointing at "out of credits / wrong key /
    upstream 5xx." Inspect `backend_error` events and surface them on
    `result.error`.

# Review red flags

- The eval path does not exercise the production adapter (parallel toy harness).
- LLM judges override failed build / test / runtime gates.
- No held-out split exists; the optimization loop sees every scenario.
- Runs do not record commit, model, prompt hash, config hash, or cost.
- `assertRealBackend` is opted out by default, not opted out only for tests.
- Scorecard JSONL is gitignored.
- `findings.jsonl` lives outside the repo.
- Trace export throws into the chat path.
- Auto-apply improvement runs without operator review and without a measured
  precision floor.
- Reports claim wins without `runId` + `commitSha` + scorecard diff link.
- Eval uses `createOpenAICompatibleBackend` and the rubric scores on MCP
  tool calls. The transport posts plain `chat/completions` with no
  `tools` field — the rubric can never pass.
- Eval builds a parallel `AgentProfile` instead of importing the
  production composer (`composeProductionAgentProfile` or equivalent
  from `src/lib/.server/sandbox/`).
- `runLoop` / `handleChatTurn` errors are swallowed — `backend_error`
  events in the stream don't propagate to harness-level failure.
- MCP delegation server mounted via static `AgentProfileMcpServer.env`
  rather than the runtime composer. The SDK doesn't template
  `mcp.env.TANGLE_API_KEY` so the static path ships an empty key.

# Acceptance checklist

A freshly-adopted product is correctly wired iff ALL hold:

- [ ] `<eval-root>/agent.config.ts` exports `defineAgent({...})` with every
      surface validated against disk at module load.
- [ ] `<eval-root>/analyst-loop.ts` runs `AnalystRegistry.run(...)` with
      `OtlpFileTraceStore`, appends findings through `FindingsStore`, and
      routes accepted findings to the product's knowledge/surface adapters.
      Ledger lives at `.evolve/findings/findings.jsonl`.
- [ ] `src/lib/.server/agent-runtime/trace-capture.ts` (or
      package-equivalent) exports a `TraceSource` factory using
      `createPushTraceSource` for owned loops or `sandboxSessionTraceSource`
      for sandbox sessions.
- [ ] Chat handler records or collects tool spans and persists them before
      teardown; telemetry forwarding failures warn without failing the user path.
- [ ] `<eval-root>/lib/backend-integrity.ts` exports
      `enforceBackendIntegrity(records, skipFlag?)`; called after
      `RunRecord[]` is built, BEFORE the ship-gate; `backend-integrity.json`
      persisted on success and on throw.
- [ ] `<eval-root>/lib/scorecard-integration.ts` (or `scorecard-integration.ts`)
      exports `buildScorecardAgentProfile(model)` (id excluded from hash,
      skills/tools sorted) + `recordScorecardAndDiff` calling
      `recordRunsToScorecard` / `loadScorecard` / `diffScorecard`.
      `.scorecard.jsonl` is committed.
- [ ] `<eval-root>/agent-profile-cell.ts` exports
      `build<Agent>AgentProfileCell({ harnessVersion, model, promptHash, backend, personaSuite })`
      and stamps every `RunRecord.agentProfile` before scorecard append.
- [ ] `src/lib/.server/production-loop/` (or `<eval-root>/lib/production-loop.ts`)
      calls `runImprovementLoop` with `holdoutScenarios` + a `defaultProductionGate`
      / `heldOutGate` gate (mean paired delta) + `autoOnPromote: 'pr'` plus
      `ghOwner` / `ghRepo` when promotion should open a PR. The loop optimizes
      the `MutableSurface` it is given (the prompt addendum by default); which
      surfaces are loop-owned vs human-curated is a product policy choice.
- [ ] CLI flag `--fail-on-regression` (or `EVAL_FAIL_ON_REGRESSION=1`) wired
      through the canonical runner.
- [ ] `.github/workflows/nightly-eval.yml` daily at 02:00 UTC on
      `[self-hosted, staging-runner]`; uploads `<runDir>/` artifact;
      `concurrency.cancel-in-progress: false`; `permissions:` includes
      `contents: write`, `issues: write`, `pull-requests: write`.
- [ ] `.github/workflows/production-loop.yml` weekly; required secrets
      documented; supports `--dry-run` workflow_dispatch input.
- [ ] `package.json` script `eval:improve` runs the analyst loop;
      `eval:production-loop` runs the held-out promotion cycle.
- [ ] `src/lib/.server/sandbox/` exports `composeProductionAgentProfile`
      (or equivalent); eval canonical runner imports it instead of
      hand-rolling its own profile.
- [ ] `eval/profile-parity.test.ts` (or equivalent) asserts the eval
      profile mounts the delegation MCP server and matches production's
      prompt / permissions / file-mount shape.
- [ ] When mounting the MCP delegation tools: `buildDelegationMcpServer`
      composes at runtime with a non-empty `TANGLE_API_KEY` (plus
      `MCP_ENABLE_DELEGATE=1` for the `delegate` verb) and is
      merged into `profile.mcp` per turn — never declared statically.
- [ ] The eval's backend understands `profile.mcp`. If using
      `createOpenAICompatibleBackend`, the rubric does NOT score on
      tool-call presence (that transport has no `tools` field). Score
      tool calls only when the backend rides the sandbox SDK.
- [ ] When `runLoop` is in use, `ctx.traceEmitter` forwards to the same
      OTLP sink as the chat path so loop telemetry is queryable
      alongside chat turns.
- [ ] Harness surfaces `backend_error` runtime events on `result.error`
      — a 402 / 401 / 5xx does NOT become a silent `toolCalls: []`
      scenario result.

Canonical scaffold delivery: `agent-builder#198`. Reference impls to mirror
file-for-file: `creative-agent`, `tax-agent`, `legal-agent`, `gtm-agent`.

# Key docs

- `references/current-substrate.md` — the single source of version truth +
  removed-symbol checks. Run `scripts/check-substrate-versions.sh` before
  editing that table. Package versions are NOT restated here.
- `@tangle-network/agent-interface` — the neutral contract: `AgentProfile`
  (no top-level `harness` field), `AgentProfileMcpServer`, `HarnessType`,
  `ReasoningEffort`, `Part` / `ToolPart` / `ToolState`, `harnessSupportsModel`,
  `reasoningEffortsFor`
- `@tangle-network/agent-profile-materialize` — `materializeProfile`,
  `WorkspacePlan`, `applyWorkspacePlan`
- `@tangle-network/agent-eval/contract` — the frozen public barrel:
  `defineAgentEval`, `selfImprove`, `runEval`, `runCampaign`,
  `runImprovementLoop`, `defaultProductionGate`, `heldOutGate`, `composeGate`,
  `analyzeRuns` → `InsightReport`, `fsCampaignStorage` / `inMemoryCampaignStorage`,
  `OutcomeStore`, intake adapters (`fromClaudeCodeSession` / `fromCodexSession`
  / `fromOtelSpans` / `fromFeedbackTable`)
- `@tangle-network/agent-eval` README + `docs/wire-protocol.md`
- `@tangle-network/agent-eval` — harness × model axis: `CODING_HARNESSES`,
  `expandProfileAxes`, `runProfileMatrix`, `groupRunsByAgentProfileCell`,
  `harnessAxisOf`, `HARNESS_NATIVE_MODEL`
- `@tangle-network/agent-eval/matrix` — `runAgentMatrix` (shipped),
  `MatrixScenario`, `MatrixAxes`, `axisExtractors`
- `@tangle-network/agent-eval/multishot` — `runMultishot`, `runMultishotMatrix`,
  `MultishotTransport` (`agentTransport` / `driverTransport` injection seam)
- `@tangle-network/agent-eval/campaign` — `runImprovementLoop`,
  `runOptimization`, `Scenario`, `MutableSurface`, the gate core
  (`heldoutSignificance`, `pairHoldout`, `powerPreflight`), the placebo/footprint
  gate (`neutralizationGate`, `neutralizeText`), discriminative
  holdout selection (`scoreDiscrimination`, `selectDiscriminative`), and the
  Lineage DAG (`Lineage`, `runLineage`, `runLineageLoop`,
  `heuristicGovernor` / `callbackGovernor`, `fsLineageStore` / `memLineageStore`,
  `Governor`)
- `@tangle-network/agent-runtime/loops` — `defineLeaderboard`,
  `resolveSandboxClient`, `streamAgentTurn` / `collectAgentTurn`, `leaderboard`
  + `renderLeaderboardMarkdown` / `renderLeaderboardSvg` / `renderLeaderboardHtml`,
  `runAgentic`, `runLoop`,
  `sample`, `refine`, `sampleThenRefine`, `adaptiveRefine`, `worktreeFanout`,
  `gateOnDeliverable`, `patchDelivered`, `selectValidWinner`,
  `createWorktreeCliExecutor`, `Driver` / `OutputAdapter` / `Validator` interfaces
- `@tangle-network/agent-runtime` root — `resolveAgentBackend`
  (`kind: 'router' | 'tcloud' | 'cli-bridge' | 'sandbox'`), `improve`
  (the RSI verb; `ImproveCodeOptions` / `ImproveSkillsOptions`)
- `@tangle-network/agent-runtime/profiles` — `CoderTask`, `coderTaskToPrompt`,
  `uiAuditorProfile`, `createInProcessUiAuditClient`
- `@tangle-network/agent-runtime/mcp` — `createMcpServer`,
  `detachedSessionDelegate`, `detectExecutor`, `createSiblingSandboxExecutor`,
  `createFleetWorkspaceExecutor`; bin `agent-runtime-mcp`
- `@tangle-network/agent-runtime/intelligence` — `withTangleIntelligence`,
  `createIntelligenceClient` + `doctor()`, `pullCertified`,
  `withCertifiedDelivery`, `composeCertifiedProfile`
- `@tangle-network/agent-runtime/loops` — `TraceSource`,
  `createPushTraceSource`, `sandboxSessionTraceSource`
- `@tangle-network/agent-runtime/agent` — `defineAgent`,
  `createSurfaceImprovementAdapter`, `createSurfaceKnowledgeAdapter`
- `@tangle-network/agent-knowledge` — `proposeFromFindings`,
  `applyKnowledgeWriteBlocks`, optional `multiHarnessResearcherFanout`
