---
name: agent-stack-adoption
description: "Adopt the self-improving Tangle agent stack (@tangle-network/{agent-interface,agent-runtime,agent-knowledge,agent-eval,sandbox,agent-profile-materialize,tcloud}) in any product. End-to-end pipeline checklist across 9 phases — single composer → ingestion → improvement-loop → MCP delegation → researcher → eval scenarios → viewer → matrix → live smoke → CI cron. Use when wiring a new product, auditing an existing product's adoption state, or extending an existing product with new phases."
---

# Agent Stack Adoption — full pipeline checklist

> **Versions move fast — run `scripts/check-substrate-versions.sh` before copying any version pin below.** npm is the source of truth and the script fails closed when a pin here falls behind it (agent-eval shipped a breaking 0.94 the same week 0.95 landed). A minor bump can rename or move an export, so re-verify API names against the new dist whenever the script flags drift.

## Related skills — what to read when

| If you are... | Read |
|---|---|
| Wiring the full stack across all 9 phases (this skill's scope) | **THIS skill** |
| Looking up specific substrate primitives (defineAgent, runLoop, MCP delegation, the `TraceSource` family, assertRealBackend, scorecard, analyst-loop, runAgentMatrix) — the primitives THIS skill assembles into a pipeline | `agent-eval-adoption` — primitive reference companion |
| Working IN the agent-eval substrate repo, calling primitives correctly, OR setting up the canonical `eval/` folder + 3 pnpm scripts | `agent-eval` (project skill, auto-loaded in agent-eval repo) — substrate footgun bible + canonical consumer layout |
| Building a judge component specifically | `eval-agent` — LLM-as-judge rubric generation |

The Tangle agent stack composes ~6 packages into one pipeline, layered over a
neutral contract at the bottom:

- **`@tangle-network/agent-interface`** — the NEUTRAL contract layer beneath the
  whole stack. Owns `AgentProfile` / `AgentProfileMcpServer` / `HarnessType` /
  `ReasoningEffort` / `Part` / `ToolPart` plus a capability layer
  (`harnessSupportsModel`, `reasoningEffortsFor`, `reasoningLadder`). Every other
  package normalizes into these types, so a profile is harness-agnostic by
  construction. Import `AgentProfile` / `AgentProfileMcpServer` from HERE
  (canonical); `@tangle-network/sandbox` still re-exports them for back-compat.
- **`@tangle-network/agent-profile-materialize`** — turns an `AgentProfile` into a
  concrete on-disk workspace (`materializeProfile` → `WorkspacePlan`,
  `applyWorkspacePlan`). The substrate that materializes the authored profile into
  harness-shaped files.
- **`@tangle-network/sandbox`** — runs the per-workspace box (`Sandbox`,
  `SandboxInstance`, `SandboxEvent`).
- **`@tangle-network/agent-runtime`** — drives the chat + delegation MCP, the
  `runLoop` kernel, drivers/combinators, coder/researcher presets, the `TraceSource`
  family, and `runAnalystLoop`.
- **`@tangle-network/agent-knowledge`** — gates research outputs through a
  propose-don't-apply layer.
- **`@tangle-network/agent-eval`** — ingests the live trace stream into a held-out
  gate that lands auto-PRs against the production prompt addendum; owns
  `runImprovementLoop` (`/contract`) / `runAgentMatrix` (`/matrix`) /
  `runMultishotMatrix` (`/multishot`).

"Adopted" means the product runs through ALL nine phases below — anything less
ships a partial loop that drifts. This skill is the state machine. Cross-link:
[`agent-eval-adoption`](../agent-eval-adoption/SKILL.md) is the substrate-primitive
reference (defineAgent, analyst loop, scorecard, ship-gate); this skill is the
pipeline shape that consumes those primitives.

## Principle

Three invariants. A product that breaks any of them is not adopted.

1. **One AgentProfile composer drives both production AND eval.** Eval imports
   the production composer; never hand-rolls a parallel "eval profile." Parity
   guarded by a vitest assertion. This is the single load-bearing pattern that
   prevents every other drift mode.
2. **Trace flow is auto-emitted at the sandbox boundary.** The chat handler
   passes `traceSink` once; ingestion, redaction, OTLP forwarding, RunRecord
   persistence, and analyst-loop input all derive from that one wire. Wire
   once, every downstream flow is free.
3. **Matrix-testable.** Any axis combination — harness × model × persona × prompt
   addendum — runs through `runAgentMatrix` against the same composer. The
   matrix is for benchmarking, not parity; cells inherit the production
   profile unchanged.

## The 9 phases

Each phase has Goal / Files / Code template / Verify / Anti-patterns /
Cross-references. Execute in dependency order. Skipping or re-ordering breaks
the loop closure.

The file paths below are an illustrative layout for a TypeScript product that
runs the chat handler on the edge (Cloudflare Workers / Remix / SvelteKit style)
and keeps server-only modules under a `.server/` boundary. Adapt the paths to
your own repo shape — what matters is the module responsibilities, not the
exact directory names.

### Phase 0 — substrate deps + version pinning

**Goal:** every consumer pins compatible versions of the substrate packages —
the neutral `@tangle-network/agent-interface` contract at the bottom, the
runtime/eval/knowledge/sandbox layers, and `@tangle-network/tcloud` for LLM calls.

**Files:** `package.json` (root or workspace package consuming the stack).

**Code template:**

```json
{
  "dependencies": {
    "@tangle-network/agent-interface": "^0.10.0",
    "@tangle-network/agent-eval": "^0.95.0",
    "@tangle-network/agent-runtime": "^0.70.0",
    "@tangle-network/agent-knowledge": "^1.7.0",
    "@tangle-network/sandbox": "^0.8.2",
    "@tangle-network/agent-profile-materialize": "^0.1.0",
    "@tangle-network/tcloud": "^0.4.13"
  },
  "pnpm": {
    "minimumReleaseAge": 4320,
    "minimumReleaseAgeExclude": [],
    "onlyBuiltDependencies": ["esbuild", "better-sqlite3"],
    "overrides": {
      "@tangle-network/agent-eval": "^0.95.0",
      "@tangle-network/agent-interface": "^0.10.0"
    }
  }
}
```

`@tangle-network/agent-profile-materialize` is optional — pin it only if you
materialize profiles to disk (Phase 1 composer can run without it).

The `pnpm.overrides` clause collapses transitive duplicates — without it
`@tangle-network/agent-runtime` ghosts a different `agent-eval` minor through
its peerDep range. agent-interface goes in `overrides` too so the whole tree
agrees on ONE copy of the contract types (a profile typed against two
agent-interface minors is the canonical structural-mismatch bug). The 72-hour
`minimumReleaseAge` quarantine catches the yank-window attack class for the
whole pnpm tree.

**Verify:**

```bash
pnpm install --frozen-lockfile && pnpm dedupe --check
# Expect: zero "duplicate" lines for any @tangle-network/* package.
```

**Anti-patterns:**

- Floating `*` or `latest` ranges — catches a malicious yank-window publish.
- Mixed versions between agent-runtime and its substrate peers. agent-runtime
  0.70 declares `@tangle-network/agent-eval >=0.93.0 <1.0.0`,
  `@tangle-network/agent-interface >=0.10.0 <1.0.0`,
  `@tangle-network/agent-knowledge >=1.7.0 <2.0.0`, and
  `@tangle-network/sandbox >=0.8.0 <1.0.0` as required peerDependencies. (The
  eval floor is `>=0.93.0`, but agent-runtime 0.70.0 is the release that
  rewired onto agent-eval 0.95.0's Proposer API — pin agent-eval `^0.95.0` to
  match.) Pin inside
  those ranges; drift breaks the analyst loop and the trace-type decode. (Confirm
  the live peer range with `npm view @tangle-network/agent-runtime peerDependencies`.)
- Omitting `minimumReleaseAge` — supply-chain hardening should pin a release-age
  quarantine for every dependency in the tree.

**Cross-references:**

- Reference (illustrative): your product's `package.json`.
- agent-eval-adoption: "Key docs" anchor lists the canonical version line.

---

### Phase 1 — single AgentProfile composer (production AND eval consume it)

**Goal:** one TypeScript function in your server-only sandbox module that returns
the `AgentProfile` for a per-turn `box.streamPrompt` call. Eval canonical
runner imports this function — never hand-rolls. This is the load-bearing
pattern.

**Files:**

- `src/server/sandbox/index.ts` — composer + `buildDelegationMcpServer`.
- `src/server/agent-profile.ts` — defines `AgentProfile` static parts
  (skills, tools, permissions, system prompt).
- `eval/profile-parity.test.ts` — vitest guard.

**Code template:**

```ts
// src/server/sandbox/index.ts
// AgentProfile / AgentProfileMcpServer are owned by the neutral contract layer.
// Import from @tangle-network/agent-interface (canonical); @tangle-network/sandbox
// re-exports them for back-compat.
import type { AgentProfile, AgentProfileMcpServer } from '@tangle-network/agent-interface'
import { PRODUCT_SYSTEM_PROMPT, productAgentProfile } from '../agent-profile'

const DELEGATION_MCP_SERVER_KEY = 'agent-runtime-delegation'

export interface ComposeProductionAgentProfileOptions {
  sandboxApiKey?: string
  sandboxBaseUrl?: string
  systemPromptOverride?: string
  name?: string
}

export function buildDelegationMcpServer(
  options: { sandboxApiKey?: string; sandboxBaseUrl?: string } = {},
): Record<string, AgentProfileMcpServer> | undefined {
  const sandboxApiKey = options.sandboxApiKey ?? process.env.TANGLE_API_KEY
  if (!sandboxApiKey) return undefined
  return {
    [DELEGATION_MCP_SERVER_KEY]: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@tangle-network/agent-runtime', 'mcp'],
      env: {
        TANGLE_API_KEY: sandboxApiKey,
        SANDBOX_BASE_URL: options.sandboxBaseUrl ?? 'https://sandbox.tangle.tools',
      },
      enabled: true,
      metadata: {
        surface: 'delegation:dispatch',
        tools: ['delegate_code', 'delegate_research', 'delegate_feedback',
                'delegation_status', 'delegation_history'],
      },
    },
  }
}

export function composeProductionAgentProfile(
  options: ComposeProductionAgentProfileOptions = {},
): AgentProfile {
  const delegationMcp = buildDelegationMcpServer({
    sandboxApiKey: options.sandboxApiKey,
    sandboxBaseUrl: options.sandboxBaseUrl,
  })
  return {
    ...productAgentProfile,
    name: options.name ?? productAgentProfile.name,
    prompt: {
      systemPrompt: options.systemPromptOverride ?? PRODUCT_SYSTEM_PROMPT,
    },
    ...(delegationMcp ? { mcp: { ...(productAgentProfile.mcp ?? {}), ...delegationMcp } } : {}),
  }
}
```

```ts
// eval/profile-parity.test.ts — vitest
import { describe, it, expect } from 'vitest'
import { composeProductionAgentProfile } from '../src/server/sandbox'

describe('eval AgentProfile mirrors production', () => {
  it('mounts the delegation MCP server with all five tools', () => {
    const profile = composeProductionAgentProfile({ sandboxApiKey: 'sk_sb_test' })
    expect(profile.mcp).toHaveProperty('agent-runtime-delegation')
    const tools = profile.mcp?.['agent-runtime-delegation']?.metadata?.tools as string[]
    expect(tools.sort()).toEqual([
      'delegate_code', 'delegate_feedback', 'delegate_research',
      'delegation_history', 'delegation_status',
    ])
  })
  it('keeps system prompt + permissions when eval-scoped', () => {
    const prod = composeProductionAgentProfile({ sandboxApiKey: 'sk_sb_test' })
    const evl  = composeProductionAgentProfile({ sandboxApiKey: 'sk_sb_test', name: 'eval-shadow' })
    expect(evl.prompt?.systemPrompt).toBe(prod.prompt?.systemPrompt)
    expect(Object.keys(evl.permissions ?? {}).sort())
      .toEqual(Object.keys(prod.permissions ?? {}).sort())
  })
})
```

**Verify:**

```bash
pnpm vitest run eval/profile-parity.test.ts
# Expect: 2 passed.
```

**Anti-patterns:**

- **Parallel eval profile.** A common audit finding — the eval rubric
  scores 0/N on delegation calls because the eval profile omitted the MCP
  entry. The parity test catches every regression of this class.
- **Static `AgentProfileMcpServer` declaration in the base profile.** The
  sandbox SDK does NOT template `env.TANGLE_API_KEY`; a static declaration
  ships an empty key and the MCP server fails at stdin handshake. Compose at
  runtime only — leave a comment next to the static `AgentProfile` parts
  explaining why the delegation server is built per-call, not declared inline.
- **Forgetting to merge existing `mcp` map** — `composeProductionAgentProfile`
  spreads `productAgentProfile.mcp` first, then layers the delegation server
  on top. Skipping the spread silently drops product-specific MCP servers.

**Cross-references:**

- Reference pattern (illustrative): `your-agent/src/server/sandbox/index.ts` —
  the composer + `buildDelegationMcpServer`.
- agent-eval-adoption: "Production-profile reuse — the trap evals fall into"
  section.

---

### Phase 2 — production trace + feedback ingestion mount

**Goal:** every production chat turn emits a `TraceEvent` stream + optional
user feedback into a durable store the analyst loop and production loop read
from. The store is filesystem-backed at `.production-data/{traces,feedback}/`
in dev and OTLP-forwarded in deployed environments.

**Files:**

- `eval/ingestion-server.ts` — boots the wire server.
- `src/server/ingestion/{client,redact,trace-store}.ts` (or a workspace
  package's `services/ingestion/`) — chat-handler hooks.
- `src/server/agent-runtime/trace-capture.ts` — per-product factory.
- `.gitignore` — exclude `.production-data/`.

**Code template:**

```ts
// eval/ingestion-server.ts
import { FileSystemFeedbackTrajectoryStore } from '@tangle-network/agent-eval'
import { startServer } from '@tangle-network/agent-eval/wire'
import { FileSystemTraceStore } from '@tangle-network/agent-eval/traces'

const port   = Number(process.env.INGESTION_PORT ?? 5005)
const host   = process.env.INGESTION_HOST ?? '127.0.0.1'
const bearer = process.env.INGESTION_BEARER_TOKEN
const isLoopback = ['127.0.0.1', 'localhost', '::1'].includes(host)

if (!bearer && (!isLoopback || process.env.NODE_ENV === 'production')) {
  throw new Error('[ingestion] INGESTION_BEARER_TOKEN required for non-loopback or prod')
}

const server = startServer({
  port, host,
  stores: {
    traceStore: new FileSystemTraceStore({
      dir: process.env.INGESTION_TRACES_DIR ?? '.production-data/traces',
    }),
    feedbackStore: new FileSystemFeedbackTrajectoryStore({
      dir: process.env.INGESTION_FEEDBACK_DIR ?? '.production-data/feedback',
    }),
  },
  auth: bearer ? { bearer } : undefined,
})

const shutdown = () => server.close(() => process.exit(0))
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown)
```

Trace capture goes through the **`TraceSource`** family — the substrate- and
harness-agnostic seam (the old `createProductionTraceSink` is gone). The common
currency is agent-eval's `ToolSpan`; detection + the failure taxonomy live in
agent-eval. Two source flavors:

- **Owned tool loop** (router-tools / cli-bridge dispatch): `createPushTraceSource()`
  → call `record(step)` per tool call.
- **Sandbox / fleet box** (the production target): `sandboxSessionTraceSource(box,
  sessionId, { harness })` reads `box.messages({ sessionId })` parts and decodes
  per-harness tool calls into spans.

```ts
// src/server/agent-runtime/trace-capture.ts
import {
  sandboxSessionTraceSource,
  createPushTraceSource,
  type TraceSource,
} from '@tangle-network/agent-runtime/loops'

// Sandbox/fleet path — collect spans from the live box session after a turn.
export function boxTraceSource(box: SessionTraceBox, sessionId: string): TraceSource {
  // `harness` selects the per-harness decoder ('opencode' | 'claude-code' | ...);
  // omit to try every registered adapter. NOTE: codex emits no structured tool
  // calls, so per-tool spans are unavailable for codex from any path.
  return sandboxSessionTraceSource(box, sessionId, { harness: 'opencode' })
}

// Owned-loop path — for a local router-tools / cli-bridge dispatch loop.
export function ownedTraceSource() {
  const { source, record } = createPushTraceSource()
  return { source, record }   // call record(step) for each tool call
}
```

Persist `await source.collect()` (the full `ToolSpan[]`) into the ingestion
store, and forward to OTLP in deployed environments. The ingest client
(`ingestion/client.ts`) MUST swallow network / server errors and `console.warn`
only — live chat must never crash because ingestion is down. `redact.ts` strips
PII (emails, names, IDs) before any event leaves the worker isolate.

**Verify:**

```bash
pnpm dev:ingestion &
curl -s http://127.0.0.1:5005/healthz
# Expect: { "status": "ok" }
# Then start chat handler and send one message; verify file lands:
ls -la .production-data/traces/events.ndjson
```

**Anti-patterns:**

- **Throwing into the user path.** A classic incident: a misconfigured OTLP
  endpoint crashed the chat-completion stream because trace capture threw. Keep
  `source.collect()` + the ingest fetch behind a try/catch that `console.warn`s —
  do NOT let a trace-store failure surface into the chat stream.
- **Losing `traceFlush` in `ctx.waitUntil`.** Cloudflare Workers tear down
  the isolate immediately on response — without `ctx.waitUntil(traceFlush())`
  the final batch of spans is dropped at request end.
- **Missing redaction layer.** A known failure mode — PII lands in a shared
  trace store. `redact.ts` strips before the ingest fetch.
- **Committing `.production-data/`.** Gitignore it; the analyst loop reads
  from local disk in dev and from the OTLP-forwarded store in prod.

**Cross-references:**

- Reference pattern (illustrative): `your-agent/src/server/ingestion/`
  (`client`, `redact`, `trace-store`) + `eval/ingestion-server.ts`.
- agent-eval-adoption: "Production trace sink" section.

---

### Phase 3 — improvement-loop on real chat path

**Goal:** the improvement loop's holdout runner drives the SAME
`runChatThroughRuntime` + `AgentExecutionBackend` that production uses. The
loop converges on real agent behavior under candidate prompts — not on a
regex over the addendum text.

> **API note:** the loop runner is `runImprovementLoop` from
> `@tangle-network/agent-eval/contract` (the loop/proposer/gate primitives moved
> to the `/contract` subpath — they are NOT on the package root). `runProductionLoop`
> was renamed — it no longer exists. `runImprovementLoop` rides on the internal
> `runOptimization` (no longer a public export) which rides on `runCampaign`
> (also `/contract`). Its options type is `RunImprovementLoopOptions`.

**Files:**

- `src/server/production-loop/index.ts` — `runProductionLoopOnce` +
  `buildHoldoutRunner`.
- `src/server/production-loop/prompt-addendum.ts` — loop-owned surface.
- `src/server/production-loop/scenarios.ts` — `LOOP_HOLDOUT_SCENARIOS`.
- `src/server/production-loop/judges.ts` — multi-judge ensemble.
- `tests/production-loop-real-worker.test.ts` — guard against fake-worker.

**Code template:**

```ts
// src/server/production-loop/index.ts (sketch)
import { httpGithubClient } from '@tangle-network/agent-eval'
import { runImprovementLoop } from '@tangle-network/agent-eval/contract'
import { runChatThroughRuntime } from '../agent-runtime/chat'
import { composeProductionAgentProfile } from '../sandbox'
import { PRODUCT_SYSTEM_PROMPT } from '../agent-profile'
import { PRODUCTION_LOOP_ADDENDUM_BASELINE, PRODUCTION_LOOP_ADDENDUM_VERSION }
  from './prompt-addendum'

export function buildHoldoutRunner(opts: { llm: { apiKey: string; baseUrl: string }
                                         ; agentBackend: AgentExecutionBackend }) {
  return {
    async run({ variant, scenarioId, rep, split, seed }) {
      const profile = composeProductionAgentProfile({ sandboxApiKey: opts.llm.apiKey })
      const systemPrompt = `${PRODUCT_SYSTEM_PROMPT}\n\n${variant.payload.addendum}`
      // Drive the REAL chat path. Token usage flows from the backend's
      // `llm_call` events — if zero, the runner never reached the model.
      const result = await runChatThroughRuntime({
        profile, systemPrompt, scenarioId, rep, seed,
        agentBackend: opts.agentBackend,
      })
      return result
    },
  }
}
```

```ts
// tests/production-loop-real-worker.test.ts — guard
import { describe, expect, it } from 'vitest'
import { buildHoldoutRunner } from '../src/server/production-loop'

it('drives the real chat path with non-zero token usage', async () => {
  const invocations = { count: 0, lastUserMessage: null as string | null }
  const backend = createStubBackend({ tokensIn: 1234, tokensOut: 567, invocations })
  const runner = buildHoldoutRunner({
    llm: { apiKey: 'fake', baseUrl: 'https://router.tangle.tools/v1' },
    agentBackend: backend,
  })
  const run = await runner.run({ variant: baseline, scenarioId: scenarios[0].id, rep: 0, split: 'holdout', seed: 1 })
  expect(invocations.count).toBe(1)
  expect(run.tokenUsage?.input).toBe(1234)         // ← if 0, fake-worker is back
  expect(run.tokenUsage?.output).toBe(567)
})
```

**Verify:**

```bash
pnpm vitest run tests/production-loop-real-worker.test.ts
# Expect: 3+ passed including the non-zero-token assertion.
pnpm eval:production-loop -- --dry-run
# Expect: ProductionLoopResult with .decision and .ship.dryRun: true.
```

**Anti-patterns:**

- **Fake-worker.** The most common regression on this phase. A historical
  runner projected the variant's addendum into a synthetic assistant string
  and judged that — the loop converged on a regex over the addendum text. The
  `tokenUsage?.input > 0` assertion is the regression test — re-introduction
  goes to zero, fail loud.
- **Loop owning static skills.** Skills under `agent-prompt/skills/` are
  human-curated. The loop only rewrites `prompt-addendum.ts`. Mixing the
  two surfaces means a loop false-positive ships through the curated path
  without operator review.
- **Single-judge ensemble.** A single judge develops a stable bias; the
  loop converges on what that judge likes. Use 3+ diverse judges from
  different model families — e.g. your product's `judges.ts` runs a small
  ensemble of distinct models so no single bias dominates.

**Cross-references:**

- Reference pattern (illustrative): `your-agent/src/server/production-loop/index.ts`
  (real-chat holdout runner) + `tests/production-loop-real-worker.test.ts`.
- agent-eval-adoption: "Held-out promotion gate + `runImprovementLoop`".

---

### Phase 4 — MCP delegation server mount

**Goal:** the per-turn `box.streamPrompt` profile carries the five delegation
tools (`delegate_code`, `delegate_research`, `delegate_feedback`,
`delegation_status`, `delegation_history`) over stdio MCP. The chat agent
sees them mid-turn and can dispatch coder/researcher workers.

**Files:**

- `src/server/sandbox/index.ts` — `buildDelegationMcpServer` (already in
  Phase 1).
- `src/server/agent-profile.ts` — `PRODUCT_SYSTEM_PROMPT` carries
  the delegation tools section + permissions block.
- `.env.local` / worker secrets — `TANGLE_API_KEY` set.

**Code template — system prompt delegation section:**

```text
## Delegation tools

You have five MCP tools that dispatch specialist agents in parallel sandboxes:

- delegate_research({ question, namespace, sources?, config? }) — researcher loop
  that pulls evidence-bearing answers from the web, workspace corpus, twitter,
  github, docs. Returns a taskId immediately; researchers take ~30-180s. Use
  for: audience research, competitor teardowns, recency-bound web evidence.
  namespace MUST be the workspace id so writes scope correctly.

- delegate_code({ goal, repoRoot, variants?, config? }) — coder loop that
  produces a validated patch (lints, typecheck, tests). Returns a taskId;
  coders take ~2-20min. Use for: data-puller scripts, one-off integrations,
  new tools needing real test coverage. Do NOT delegate <50-line inline scripts.

- delegation_status({ taskId }) — poll a delegation. Returns
  { status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled', progress?, result? }.
  Poll every 30-60s, NOT every second.

- delegation_history({ namespace?, profile?, since?, limit? }) — read past
  delegations newest-first. Use BEFORE delegating a question you might have
  already asked.

- delegate_feedback({ refersTo, rating, by }) — record your judgment of a
  completed delegation. Append-only. Rate AFTER you've used the output so
  the calibration signal reflects realized utility.

When a request would fan out into deep research or non-trivial code: dispatch
ONE delegation, tell the user "pulling X in background, will fold into the
brief", continue inline, poll. Do NOT block the chat waiting on the delegation.
```

**Permissions block** (in `productAgentProfile`):

```ts
const PERMISSIONS: Record<string, AgentProfilePermissionValue> = {
  // ... product-specific surfaces ...
  'delegation:dispatch': 'allow',
  'delegation:status':   'allow',
  'delegation:feedback': 'allow',
}
```

**`TANGLE_API_KEY` — scope:** `sk_sb_*` (sandbox-scoped) for free-tier
consumers; `orch_prod_*` (orchestrator) for paid-router production workers.
Sibling mode by default; set `TANGLE_FLEET_ID` to dispatch into a shared
fleet workspace (worker diffs land on the caller's filesystem directly).

**Verify:**

```bash
TANGLE_API_KEY=sk_sb_test npx -y @tangle-network/agent-runtime mcp --help
# Expect: usage line. Then start the chat handler, send "research <topic>",
# and confirm a tool_call event for delegate_research lands in the trace.
grep -c 'delegate_research' .production-data/traces/events.ndjson
```

**Anti-patterns:**

- **Empty `TANGLE_API_KEY`.** The bin exits 2 with a clear message; do NOT
  paper over by setting `AGENT_RUNTIME_MCP_ALLOW_NO_KEY=1` for non-diagnostic
  use — that opt-in only enables queue-only (feedback / status / history),
  not dispatch.
- **System prompt without delegation tools section.** The agent sees the
  MCP tools exposed by the runtime but never calls them — the model needs
  the verbal cue in the prompt to route requests.
- **Fleet mode with mismatched API key.** `TANGLE_FLEET_ID` set + key can't
  resolve the handle → bin exits 2. Don't silently degrade to sibling.

**Cross-references:**

- Reference pattern (illustrative): `your-agent/src/server/agent-profile.ts`
  (delegation tools section in the system prompt) +
  `your-agent/src/server/sandbox/index.ts` (the composed MCP entry).
- An on-chain coder-driver blueprint is the original MCP pattern that inspired
  the substrate (a per-task sandbox dispatching a validated coder loop); the
  substrate has since subsumed it.
- agent-eval-adoption: "MCP delegation tools — `@tangle-network/agent-runtime/mcp`".

---

### Phase 5 — researcher profile + knowledge namespace

**Goal:** `delegate_research` outputs land in a per-customer knowledge
namespace as PROPOSED writes (not auto-applied). The propose-don't-apply
layer guarantees a foreign-namespace check — a researcher cannot scope items
outside its caller's namespace.

**Files:**

- `src/server/agent-knowledge/index.ts` — search + format-citations
  surface backed by `import.meta.glob('knowledge/**/*.md')`.
- `knowledge/` — markdown corpus with frontmatter (authority, jurisdiction,
  last_verified).
- `scripts/seed-knowledge.ts` — materialize `.agent-knowledge/index.json`
  for offline analysis.

**Code template:**

```ts
// src/server/agent-knowledge/index.ts
import {
  parseFrontmatter, searchKnowledge as agentSearchKnowledge,
  tokenizeQuery,
} from '@tangle-network/agent-knowledge'
import type { KnowledgeSearchResult } from '@tangle-network/agent-knowledge'

const VITE_CORPUS_MODULES: Record<string, string> = (() => {
  try {
    return import.meta.glob('../../../knowledge/**/*.md', {
      eager: true, query: '?raw', import: 'default',
    }) as Record<string, string>
  } catch { return {} }
})()

export function searchKnowledge(query: string, limit = 5): KnowledgeSearchResult[] {
  // Build the typed corpus on first call, cache for the lifetime of the isolate.
  const corpus = buildCorpus(VITE_CORPUS_MODULES)
  return agentSearchKnowledge({ query: tokenizeQuery(query), corpus, limit })
}

export function formatCitationsForPrompt(query: string, limit = 5): string {
  return searchKnowledge(query, limit)
    .map((r) => `[${r.authority}]: ${r.snippet} — kb://${r.path}`)
    .join('\n')
}
```

The researcher's `proposeFromFindings(findings, opts)` returns `WriteBlock[]`
the operator review-merges via PR. `applyKnowledgeWriteBlocks(blocks, root)`
is called by the analyst-loop auto-apply path only at confidence ≥0.85 (see
Phase 1 of agent-eval-adoption).

**Foreign-namespace check:** the MCP validator hard-fails when any researcher
item carries a `namespace` other than the caller's. Never pass another
tenant's namespace.

**Verify:**

```bash
pnpm tsx scripts/seed-knowledge.ts
ls -la .agent-knowledge/index.json
# Expect: index with corpus.pages.length > 0.
pnpm vitest run src/server/agent-knowledge/
```

**Anti-patterns:**

- **Auto-applying researcher proposals.** Researchers are a calibrated false-
  positive source. Default `autoApply.knowledge.mode = 'write'` only AFTER
  measuring producer precision against a held-out set. A high-stakes vertical
  (e.g. a legal or tax agent) should stay at `'open-pr'` until precision is
  proven, and only then flip to a confidence threshold like ≥0.85.
- **Cross-tenant namespace bleed.** The researcher MCP enforces a per-call
  namespace; the caller must pass the active workspace id. Hardcoded /
  shared namespaces silently merge tenants.
- **Worker-bundle path drift.** `import.meta.glob` is build-time; if the
  knowledge dir moves the bundle is empty and runtime falls through to the
  Node fs branch (which only works in tsx/eval). Verify by grepping the
  worker bundle output for a known snippet.

**Cross-references:**

- Reference pattern (illustrative): `your-agent/src/server/agent-knowledge/index.ts`
  (search + citations) and a `knowledge/` corpus with authority/jurisdiction
  frontmatter for high-stakes domains.
- agent-eval-adoption: "Analyst loop" — `createSurfaceKnowledgeAdapter`.

---

### Phase 6 — delegation eval scenarios

**Goal:** a hand-curated set of 5-10 scenarios per product that drive the
production chat path with the delegation MCP mounted, and assert the agent
(a) recognized the need to delegate, (b) called the right tool with sensible
args, (c) drove the delegation toward completion, (d) incorporated the
output in its final response.

**Files:**

- `eval/canonical-delegation.ts` — harness that drives `runChatThroughRuntime`
  and inspects the `tool_call` event stream against `DelegationExpectation`s.
- `eval/scenarios/delegation-build-tools.ts` — scenario definitions with
  expected tool calls + arg matchers.

**Code template:**

```ts
// eval/scenarios/delegation-build-tools.ts
export interface DelegationExpectation {
  tool: 'delegate_code' | 'delegate_research' | 'delegate_feedback' |
        'delegation_status' | 'delegation_history'
  expectedCount: number
  argMatchers?: string[]              // every matcher must hit ≥1 call
  argSlots?: Array<{ slot: number; matchers: string[] }>
}

export interface DelegationScenario {
  id: string
  personaId: string
  title: string
  userMessage: string
  expectations: DelegationExpectation[]
  passThreshold: number               // composite rubric threshold, default 0.7
}

export const DELEGATION_SCENARIOS: DelegationScenario[] = [
  {
    id: 'founder-market-research',
    personaId: 'founder',
    title: 'Recency-bound market research',
    userMessage: 'What is typical CAC for direct-to-retail in 2026?',
    expectations: [
      { tool: 'delegate_research', expectedCount: 1,
        argMatchers: ['CAC', 'retail', '2026'] },
    ],
    passThreshold: 0.7,
  },
  {
    id: 'b2b-pipeline-puller',
    personaId: 'b2b-saas-founder',
    title: 'Pipeline scraper tool delegation',
    userMessage: 'Build a tool that pulls Stripe MRR + Posthog signups.',
    expectations: [
      { tool: 'delegate_code', expectedCount: 1,
        argMatchers: ['stripe', 'posthog'] },
    ],
    passThreshold: 0.7,
  },
  // ... scenarios for your product's other personas
]
```

```ts
// eval/canonical-delegation.ts (sketch)
import { composeProductionAgentProfile } from '../src/server/sandbox'
import { runChatThroughRuntime } from '../src/server/agent-runtime/chat'

export async function runDelegationScenario(scenario: DelegationScenario, opts: RunOpts) {
  const profile = composeProductionAgentProfile({ sandboxApiKey: opts.sandboxApiKey })
  const events: RuntimeStreamEvent[] = []
  const result = await runChatThroughRuntime({
    profile, message: scenario.userMessage, maxTurns: opts.maxTurns ?? 2,
    onEvent: (ev) => events.push(ev),
  })
  const toolCalls = events.filter((e) => e.type === 'tool_call' &&
    DELEGATION_TOOL_NAMES.includes(e.tool as DelegationToolKind))
  const checks = scenario.expectations.map((exp) => scoreExpectation(exp, toolCalls))
  return { scenarioId: scenario.id, toolCalls, expectations: checks,
           pass: checks.every((c) => c.countOk && c.argMatchersOk && c.argSlotsOk) }
}
```

**Aim for 5-10 scenarios** spanning the distinct personas your product serves
(e.g. founder / operator / marketer / analyst / local-service). One scenario
per delegation tool kind so coverage is even.

**Verify:**

```bash
pnpm eval:delegation --backend sandbox
# Expect: per-scenario JSON results under eval/.runs/<runId>/.
# Composite ≥0.7 on ≥80% of scenarios for a passing run.
pnpm eval:delegation --persona founder            # subset
pnpm eval:delegation --scenario competitor-dashboard
```

**Anti-patterns:**

- **Scoring on tool-call presence with a transport that strips `tools`.**
  `createOpenAICompatibleBackend` POSTs `{ model, stream, messages }` only —
  no `tools` field. The rubric scores 0 with `error: null` on every run.
  Use the sandbox client backend (which respects `profile.mcp`), not the
  router-direct transport.
- **Silently swallowed `backend_error` events.** A 402 / 401 / 5xx from the
  router becomes a `backend_error` event in the stream; if the harness
  treats stream-end as success, the rubric reports "agent didn't delegate"
  when reality is "agent never reached the model." Inspect `backend_error`
  and surface on `result.error`.
- **Asserting on free-text output.** Tool-call asserts are structural; text
  matchers are flaky. Stick to `tool_call` event inspection.

**Cross-references:**

- Reference pattern (illustrative): `your-agent/eval/canonical-delegation.ts`
  + `your-agent/tests/eval-delegation-scenarios.test.ts`.

---

### Phase 7 — viewer + matrix over AgentProfile[] + multishot driver-agent

**Goal:** three surfaces:
- **Viewer** — single-file HTML at `eval/viewer/viewer.html` that loads a
  run's NDJSON artifacts and renders the trace + delegation timeline.
- **Matrix** — `runAgentMatrix` (`@tangle-network/agent-eval/matrix`) sweeps the cartesian
  product of (**AgentProfile** × persona × rep), aggregating by axis.
- **Multishot driver-agent** — `runMultishot` simulates a real user (LLM
  driver as persona) chatting with the agent across 10+ turns, with REAL
  inline tool execution (delegate_research + delegate_code), then runs THREE
  separate judges (conversation, code-review, content-quality).

**The PRIMARY matrix axis MUST be `AgentProfile[]` (the canonical type from
`@tangle-network/agent-interface`).**

Not `harness[]`, not `model[]`, not `reasoningLevel[]`. AgentProfile
encapsulates ALL of those (systemPrompt, tools, mcp, reasoning level,
harness preference, skills, knowledge namespace). When you test variations,
you're testing PROFILES — different production composers, different system
prompts, different MCP topologies. Same persona, radically different agent
surface. Custom user-supplied profiles will eventually become first-class
matrix participants; build for that today.

**Files:**

- `eval/viewer/viewer.html` + `eval/viewer/extract.ts` + `eval/viewer/serve.mjs`.
- `eval/agent-profiles.ts` — define 3+ AgentProfile variants (baseline + A/B).
- `eval/multishot.ts` — driver-agent runner with inline tool execution.
- `eval/multishot-judges.ts` — conversation + code-review + content-quality.
- `eval/matrix.ts` — wraps `runAgentMatrix` over the profiles.

**Code template — agent-profiles.ts:**

```ts
// eval/agent-profiles.ts
import type { AgentProfile } from '@tangle-network/agent-interface'
import { composeProductionAgentProfile } from '../src/server/sandbox'

// Baseline = exact production composer output (eval must equal production)
export const profileBaseline: AgentProfile = composeProductionAgentProfile()

// AgentProfile carries the system prompt under `prompt.systemPrompt`
// (there is no top-level `systemPrompt` field — it lives on `prompt`).
const baseSystemPrompt = profileBaseline.prompt?.systemPrompt ?? ''

// Delegation-heavy = same composer + override systemPrompt to push tool use
export const profileDelegationHeavy: AgentProfile = {
  ...profileBaseline,
  prompt: { ...profileBaseline.prompt, systemPrompt: `${baseSystemPrompt}\n\nIMPORTANT: ALWAYS use delegate_research before answering audience questions. ALWAYS use delegate_code when the user asks for scripts, pipelines, or dashboards.` },
}

// Interview-first = mandate 3 interview turns before any artifact
export const profileInterviewFirst: AgentProfile = {
  ...profileBaseline,
  prompt: { ...profileBaseline.prompt, systemPrompt: `${baseSystemPrompt}\n\nMANDATORY: Spend the first 3 turns interviewing the user about audience, metrics, constraints. Do not produce artifacts until you have these answers.` },
}

export const PROFILES = {
  baseline: profileBaseline,
  'delegation-heavy': profileDelegationHeavy,
  'interview-first': profileInterviewFirst,
} as const
```

**Code template — multishot.ts (driver-agent with REAL tool execution):**

```ts
// eval/multishot.ts
// Multi-turn simulation: LLM driver acts as persona, agent has tools,
// tool_calls execute inline (researcher / coder LLM calls), 10+ turns.
import type { AgentProfile } from '@tangle-network/agent-interface'
import type { Persona } from './personas'

export async function runMultishot(opts: {
  profile: AgentProfile
  persona: Persona
  maxTurns: number  // recommended: 10+
}): Promise<{ transcript: Msg[]; artifacts: Artifact[]; toolCalls: number; costUsd: number }> {
  // 1. Driver = LLM as persona (reactive, non-deterministic)
  // 2. Agent has OpenAI tools[] for delegate_research + delegate_code
  // 3. When agent emits tool_call → inline execution:
  //    - delegate_research(question) → researcher LLM call → research brief
  //    - delegate_code(goal) → coder LLM call → real code block
  // 4. Tool_result returned to agent → agent continues
  // 5. Driver responds reactively → repeat for maxTurns
  // 6. Defend against driver empty content (retry once, then fail loud)
  // 7. Bypass any readiness gates on the AGENT side (eval-only)
}
```

**Code template — matrix.ts:**

```ts
// eval/matrix.ts
import { runAgentMatrix } from '@tangle-network/agent-eval/matrix'
import { PROFILES } from './agent-profiles'
import { PERSONAS } from './personas'
import { runMultishot } from './multishot'
import { scoreConversation, scoreCodeArtifacts, scoreContentArtifacts } from './multishot-judges'

const result = await runAgentMatrix({
  axes: [
    { name: 'profile', values: Object.entries(PROFILES).map(([id, value]) => ({ id, value })) },
    { name: 'persona', values: PERSONAS.map((p) => ({ id: p.id, value: p })) },
  ],
  reps: 1,
  maxConcurrency: 2,
  costCeiling: 10.0,
  async runCell(cell, signal) {
    const profile = cell.axes.profile.value as AgentProfile
    const persona = cell.axes.persona.value as Persona
    const sim     = await runMultishot({ profile, persona, maxTurns: 10 })
    // THREE separate judge passes (DO NOT combine — each is too important)
    const convoScore   = await scoreConversation(sim.transcript, persona)
    const codeScore    = await scoreCodeArtifacts(sim.artifacts.filter((a) => a.type === 'code'))
    const contentScore = await scoreContentArtifacts(sim.artifacts.filter((a) => a.type !== 'code'))
    const composite    = (convoScore.composite + codeScore.composite + contentScore.composite) / 3
    return { score: composite, costUsd: sim.costUsd, output: { transcript: sim.transcript, artifacts: sim.artifacts, scores: { convoScore, codeScore, contentScore } } }
  },
})

console.log('byAxis.profile:', result.byAxis.profile)
console.log('byAxis.persona:', result.byAxis.persona)
```

**Verify:**

```bash
pnpm eval:viewer eval/.runs/<runId>/
# Expect: HTTP server on :3001 with the run loaded.
pnpm eval:matrix --reps 1 --max-concurrency 2
# Expect: byAxis aggregation + cost summary. cellsSkipped tracks aborts.
```

**Anti-patterns:**

- **Eval bypasses the production path entirely.** This is the most
  expensive bug class. If your eval uses bareback `fetch()` to
  `/chat/completions` (or a "sandbox-backend" that's actually OpenAI-compat
  direct), MCP tools never fire, harness routing never happens, knowledge
  gates never trigger. The eval scores fictional behavior. **Route through
  `runChatThroughRuntime` + the same composer as production** — OR run
  multishot with inline tool execution that mimics what the harness would do.
- **Matrix axis is `model[]` or `harness[]` instead of `AgentProfile[]`.**
  Profile is the canonical surface (encapsulates everything else). Test
  profile variations, not orthogonal axes you'd never ship.
- **Single composite score from ONE judge.** A scalar score is too weak.
  Use 3 separate judges (conversation, code-review, content-quality) and
  surface per-dimension breakdowns. The MOSS-paper lesson: lock the rubric
  at baseline, compare candidates against same keypoints.
- **Generating text and scoring keywords.** "Does the response contain
  'plan' and 'week'?" is not a real eval. Score on artifact quality (real
  code runs? real research has citations? content audience-fit?) via
  separate judge passes.
- **Hand-rolling aggregations from `cells[]`.** The substrate aggregator
  handles `error` / `skipped` cells correctly. Hand-rolling almost always
  under-counts skipped cells.
- **`costCeiling` too high for paid backends.** Set conservatively
  ($5-$10 for nightly, $25-$50 for ad-hoc full sweeps).
- **Driver-empty-content silently passing.** When the persona-simulating
  LLM returns empty content, the loop must retry once then fail loudly.
  Silent empty responses produce fake adaptive scores ("agent gave up
  asking", "user went silent").

**Cross-references:**

- Reference pattern (illustrative): `your-agent/eval/viewer/viewer.html`
  (single-file pattern) + `your-agent/eval/viewer/extract.ts`.
- agent-eval source: the matrix runner in `@tangle-network/agent-eval/matrix`.
- agent-eval-adoption: "Cross-profile matrix — `runAgentMatrix`".

---

### Phase 8 — live full-loop smoke

**Goal:** one command runs ONE message through the full production chat
path with all eight prior phases live, and verifies the trace landed in the
ingestion store + an `analyst-loop` invocation produced ≥1 finding.

**Files:**

- `scripts/smoke-full-loop.ts` — orchestrates the smoke run.
- `.smoke/<runId>/` — artifact directory.

**Trace flow:**

```
chat handler (HTTP POST /chat)
  └─ composeProductionAgentProfile()                  Phase 1
       └─ box.streamPrompt(message, { backend: { profile } })
            └─ SandboxEvent stream (text_delta / tool_call / tool_result)
                 └─ tool_call → delegate_research      Phase 4 (MCP mounted)
                      └─ child sandbox runs researcher Phase 5
                           └─ items[] returned via tool_result
                 └─ traceSink(events)                  Phase 2
                      └─ POST /v1/traces/ingest        ingestion-server
                           └─ FileSystemTraceStore     .production-data/traces/
                                └─ analyst-loop reads  Phase 3 input
                                     └─ findings.jsonl
                                          └─ production-loop holdout gate
                                               └─ httpGithubClient auto-PR
```

**Verify:**

```bash
pnpm tsx scripts/smoke-full-loop.ts --message "research CAC for B2B SaaS"
# Expect every line of the trace flow to fire:
#   [smoke] sandbox created (sandboxId=...)
#   [smoke] tool_call delegate_research seen
#   [smoke] tool_result with items.length > 0 seen
#   [smoke] trace event lands in .production-data/traces/events.ndjson
#   [smoke] analyst-loop produced N findings
#   [smoke] PASS
```

**Common failure modes:**

- `tool_call delegate_research` never fires → Phase 4 MCP mount broken.
  Check `TANGLE_API_KEY` set and `buildDelegationMcpServer` returns
  non-undefined.
- `tool_result` empty items → Phase 5 researcher namespace mismatch.
- Trace doesn't reach ingestion → Phase 2 client URL allowlist rejecting
  non-loopback host, or bearer token missing.
- Analyst-loop produces zero findings → manifest's `analystKinds` is empty,
  OR `OtlpFileTraceStore` reading wrong path.

**Anti-patterns:**

- **Skipping the smoke as "too slow."** This is the only test that proves
  every phase wires through. Run it in CI on every PR that touches any of
  Phases 1-7.
- **Stubbing the sandbox client.** Smoke uses real `Sandbox.create()`. If
  you can't afford that, run nightly only — but DON'T pretend stubs prove
  the loop closure.

**Cross-references:**

- Reference pattern (illustrative): `your-agent/eval/.smoke/` (artifact format).
- agent-eval-adoption: "Live trace flow — the production-to-evolution pipeline".

---

### Phase 9 — production-loop CI cron

**Goal:** weekly automated run of `runImprovementLoop` on a self-hosted
runner, gated by the held-out evaluation, opening a draft PR against the
loop-owned addendum surface on gate pass.

**Files:**

- `.github/workflows/production-loop.yml` — Monday 06:00 UTC cron.
- `.github/workflows/nightly-eval.yml` — daily 02:00 UTC eval + scorecard.

**Code template:**

```yaml
# .github/workflows/production-loop.yml
name: production-loop
on:
  schedule:
    - cron: '0 6 * * 1'    # Monday 06:00 UTC
  workflow_dispatch:
    inputs:
      dry_run:
        description: 'Run without opening a PR'
        required: false
        default: 'false'
        type: choice
        options: ['true', 'false']

concurrency:
  group: production-loop-${{ github.ref }}
  cancel-in-progress: false              # MUST be false — scorecard append order

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  production-loop:
    runs-on: [self-hosted, your-runner-label]   # tcloud + cli-bridge reachable
    timeout-minutes: 90
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - name: run production-loop cycle
        env:
          TANGLE_API_KEY:   ${{ secrets.TANGLE_API_KEY }}
          GH_AUTO_PR_TOKEN: ${{ secrets.GH_AUTO_PR_TOKEN }}
          GITHUB_TOKEN:     ${{ secrets.GITHUB_TOKEN }}
          DRY_RUN_INPUT:    ${{ github.event.inputs.dry_run }}
        run: |
          set -euo pipefail
          extra=""
          if [[ "${DRY_RUN_INPUT:-false}" == "true" ]]; then extra="-- --dry-run"; fi
          pnpm eval:production-loop $extra
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: production-loop-${{ github.run_id }}
          path: .evolve/optimization/**
          retention-days: 14
```

**The loop-owned addendum surface** (`src/server/production-loop/prompt-addendum.ts`)
is the ONLY file the loop rewrites. Static skills under `agent-prompt/skills/`
are human-curated. Mixing the surfaces ships loop false-positives through the
curated path.

**Verify:**

```bash
gh workflow run production-loop --field dry_run=true
gh run watch
# Expect: workflow succeeds, artifact uploaded.
# Inspect .evolve/optimization/*/ProductionLoopResult.json for .decision.
```

**Anti-patterns:**

- **`runs-on: ubuntu-latest`.** The `tcloud` backend + `cli-bridge`
  require a self-hosted runner with network reach to the bridge. GitHub-hosted
  runners can't reach it. Label your runner and target the label.
- **`cancel-in-progress: true`.** Two crons landing on the same SHA + a
  cancellation corrupts the scorecard append order. Always `false`.
- **Scoped-down token.** `permissions:` must include `contents: write`,
  `issues: write`, `pull-requests: write`. A scoped-down token silently
  no-ops the auto-PR and the regression-issue flows.
- **No `--dry-run` knob.** Operators MUST be able to run the workflow
  without opening a PR; `workflow_dispatch.inputs.dry_run` is the canonical
  knob.

**Cross-references:**

- Reference pattern (illustrative): `your-agent/.github/workflows/production-loop.yml`.
- agent-eval-adoption: "CI workflow integration".

---

## Adoption state machine

Each product is at exactly one phase at any time. To determine state, run the
verify command for each phase in order — the FIRST one that fails is the
product's current phase. A future `pnpm doctor:adoption` substrate CLI will
automate this.

```
   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
   │ Phase 0  │───►│ Phase 1  │───►│ Phase 2  │───►│ Phase 3  │
   │ deps     │    │ composer │    │ ingest   │    │ prod-loop│
   └──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                          │
                                                          ▼
   ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
   │ Phase 7  │◄───│ Phase 6  │◄───│ Phase 5  │◄───│ Phase 4  │
   │ matrix   │    │ scenarios│    │ researcher│   │ MCP      │
   └──────────┘    └──────────┘    └──────────┘    └──────────┘
        │
        ▼
   ┌──────────┐    ┌──────────┐
   │ Phase 8  │───►│ Phase 9  │───► (looping back to Phase 1 via
   │ smoke    │    │ CI cron  │      auto-PR landing on the addendum)
   └──────────┘    └──────────┘
```

A product moves forward only when every prior phase's verify passes. Phases
0-3 form the substrate (a chat path with durable traces). Phases 4-5 add
delegation. Phases 6-7 add evaluation. Phases 8-9 close the autonomous loop.

## R&D state — what's evolving in the substrate

Track this section against the released packages; bump as new primitives land.

Versions below verified against the published dist (`npm pack` + grep). When the
substrate moves, re-verify with `npm view @tangle-network/<pkg> version` and a dist
grep — do NOT trust this table over the registry.

| Primitive                              | Package / subpath                | Version | Status   |
| -------------------------------------- | -------------------------------- | ------- | -------- |
| Neutral contract (`AgentProfile` / `Part` / `ToolPart` / `HarnessType`) | agent-interface (`.`) | 0.10.x  | shipped  |
| Capability layer (`harnessSupportsModel` / `reasoningEffortsFor` / `reasoningLadder`) | agent-interface (`.`) | 0.10.x | shipped |
| `materializeProfile` / `applyWorkspacePlan` (`WorkspacePlan`) | agent-profile-materialize (`.`) | 0.1.x | shipped |
| `runLoop` kernel                       | agent-runtime (`/loops`)         | 0.70.x  | shipped  |
| Custom `Driver` on `runLoop` (refine / sample) | agent-runtime (`/loops`) | 0.70.x | shipped — author a `Driver`; `createRefineDriver` is gone. |
| `Scope` / `Supervisor` + combinators (`fanout`/`loopUntil`/`panel`/`verify`/`pipeline`) | agent-runtime (`/loops`) | 0.70.x | shipped |
| `coderProfile` preset                  | agent-runtime (`/profiles`)      | 0.70.x  | shipped  |
| `worktreeFanout` / `gateOnDeliverable` / `patchDelivered` / `selectValidWinner` / `createWorktreeCliExecutor` (`WorktreePatchArtifact` / `DeliverableSpec`) | agent-runtime (`/loops`) | 0.70.x | shipped — the generic coder surface (NOT the package root); `multiHarnessCoderFanout` is gone. |
| `TraceSource` family (`createPushTraceSource` / `sandboxSessionTraceSource` / `ToolSpan`) | agent-runtime (`/loops`) | 0.70.x | shipped — replaces `createProductionTraceSink`. |
| `createScopeAnalyst` / online `watchTrace` + settle `analyzeTrace` | agent-runtime (`/loops`) | 0.70.x | shipped |
| MCP server (5 delegation tools)        | agent-runtime (`/mcp`)           | 0.70.x  | shipped  |
| Sibling executor (default)             | agent-runtime (`/mcp`)           | 0.70.x  | shipped  |
| Fleet executor (`TANGLE_FLEET_ID`)     | agent-runtime (`/mcp`)           | 0.70.x  | shipped  |
| `defineAgent` manifest                 | agent-runtime (`/agent`)         | 0.70.x  | shipped  |
| `createSurface{Improvement,Knowledge}` | agent-runtime (`/agent`)         | 0.70.x  | shipped  |
| `improvementDriver` / `reflectiveGenerator` / `agenticGenerator` / `commandVerifier` | agent-runtime (`.`, package root) | 0.70.x | shipped — re-exported from root; no `/improvement` subpath. |
| `runAnalystLoop`                       | agent-runtime (`/analyst-loop`)  | 0.70.x  | shipped in src; subpath NOT in `package.json` `exports` — see caveat below. |
| `createOtelExporter` / `exportTraceBundle` / `toOtelJson` | agent-runtime (`.`) + sandbox | 0.70.x / 0.8.2 | shipped — `createOtelExporter` is agent-runtime root; `exportTraceBundle` / `toOtelJson` are sandbox. `withOtelPipeline` does NOT exist in agent-runtime (it is an agent-EVAL root export). |
| `runImprovementLoop` / `runCampaign` / `selfImprove` / `defineAgentEval` / `gepaProposer` / `defaultProductionGate` | agent-eval (`/contract`) | 0.95.x | shipped — `/contract`, NOT root; replaces `runProductionLoop`. `runOptimization` is now internal (no longer exported). |
| `runAgentMatrix` (cartesian, byAxis)   | agent-eval (`/matrix`)           | 0.95.x  | shipped  |
| `runMultishot` / `runMultishotMatrix`  | agent-eval (`/multishot`)        | 0.95.x  | shipped  |
| `assertRealBackend`                    | agent-eval (`.`)                 | 0.95.x  | shipped  |
| Scorecard (`agentProfileHash` / `agentProfileId` / `agentProfileModelId`, diff) | agent-eval (`.`) | 0.95.x  | shipped  |
| `buildAgentProfileCell` / `buildAgentInterfaceProfileCell` (`agent-interface-profile` kind) | agent-eval (`.`) | 0.95.x | shipped — `buildSandboxAgentProfileCell` removed in 0.94. |
| `proposeAutomatedPullRequest` / `HeldOutGate` (class) | agent-eval (`.`)        | 0.95.x  | shipped  |
| Wire server (`startServer`)            | agent-eval (`/wire`)             | 0.95.x  | shipped  |
| `FileSystemTraceStore`                 | agent-eval (`/traces`)           | 0.95.x  | shipped  |
| `proposeFromFindings`                  | agent-knowledge (`.`)            | 1.7.x   | shipped  |
| `applyKnowledgeWriteBlocks`            | agent-knowledge (`.`)            | 1.7.x   | shipped  |
| `searchKnowledge` / `tokenizeQuery`    | agent-knowledge (`.`)            | 1.7.x   | shipped  |
| Researcher profile preset              | agent-runtime (`/profiles`)      | —       | deferred — currently a `ResearcherDelegate` interface, not a preset. |
| `pnpm doctor:adoption` CLI             | agent-eval (or new substrate)    | —       | open issue — would automate the state-machine probe above.           |
| Matrix `aggregateBy` named scopes      | agent-eval (`/matrix`)           | 0.95.x  | shipped  |

> **`runAnalystLoop` packaging caveat.** `runAnalystLoop` lives in
> `src/analyst-loop/` and the repo's own example doc imports it from
> `@tangle-network/agent-runtime/analyst-loop`, but as of agent-runtime 0.70.0
> that subpath is NOT declared in `package.json` `exports` (no `./analyst-loop`
> entry) and is not re-exported from any built barrel. Importing it from a
> published install will fail to resolve until the package adds the subpath —
> verify against the installed dist before relying on it.

## Anti-patterns (cross-cutting)

Each is caught in at least one real adoption. The fix is always "extend, don't
duplicate."

1. **Fake-worker** — the holdout runner projects the addendum into a synthetic
   string and judges that. Fix: assert `tokenUsage.input > 0` per Phase 3.
2. **Parallel eval profile** — eval hand-rolls an `AgentProfile` that omits
   MCP / permissions / mounts. Fix: parity test per Phase 1.
3. **Silent trace redaction** — PII lands in the shared store. Fix: redaction
   layer per Phase 2.
4. **Transport with no `tools` field** — `createOpenAICompatibleBackend` POSTs
   `{ messages }` only; MCP tools never surface. Fix: sandbox-client backend
   per Phase 6.
5. **Backend errors swallowed** — a 402 becomes a `backend_error` stream event;
   the harness reports "no tool call." Fix: surface `backend_error` on
   `result.error` per Phase 6.
6. **Empty `TANGLE_API_KEY`** — static `AgentProfileMcpServer.env` doesn't
   template. Fix: runtime composer per Phase 1.
7. **`TANGLE_SANDBOX_API_KEY` vs `TANGLE_API_KEY` split** — the MCP bin
   reads `TANGLE_API_KEY` only. Products that previously used a separate
   sandbox-key var need to unify. Fix: name the env var
   `TANGLE_API_KEY` everywhere; the bin's expectation is hard-coded.
8. **Scorecard JSONL gitignored** — the cross-commit timeline can't compute
   without the prior run's row. Fix: commit `eval/.scorecard.jsonl` per
   Phase 5 of agent-eval-adoption.
9. **Auto-applied improvement adapter without precision data** — default
   `'open-pr'`, flip to `'write'` only after measuring producer precision.
   See Phase 5.
10. **`cancel-in-progress: true` on the cron** — silently corrupts
    scorecard append order. Always `false` per Phase 9.

## Subagent invocation

When a subagent is asked to "adopt the agent stack in `<product>`":

1. **Read this skill** (the harness loads it automatically when the
   `/agent-stack-adoption` slug is invoked).
2. **Audit current state**: run each phase's Verify command in order. The
   first that fails is the product's current phase.
3. **Plan deltas**: list every file to add/modify per phase, sequenced by
   the dependency arrows in the state machine. Never skip phases.
4. **Execute in dependency order**: Phase 0 → 1 → 2 → ... → 9. Inside a
   phase, follow the file list top-to-bottom. NEVER start Phase N+1 before
   Phase N's verify passes.
5. **Run verifications between phases**: a phase's Verify command is the
   gate. If it fails, fix the phase before moving on.
6. **Report state at end**: the highest-numbered phase whose Verify passed,
   the file list touched per phase, any anti-patterns the audit caught,
   the smoke-test result from Phase 8 if executed.

Cross-link to [`agent-eval-adoption`](../agent-eval-adoption/SKILL.md) for
substrate-primitive depth — defineAgent, analyst loop internals, scorecard
mechanics, NaN-p verdict traps, Welch's t-test, held-out gate. This skill
is the WHEN and SEQUENCE; that skill is the HOW and WHY.

## Reference layout (audit + extract patterns)

The most instructive product to study is one where every phase is implemented
end-to-end. Whatever your fullest reference is, extract these surfaces:

- `src/server/sandbox/index.ts` — Phase 1 composer + delegation MCP.
- `src/server/agent-profile.ts` — Phase 4 system prompt with tools section.
- `src/server/production-loop/index.ts` — Phase 3 real-chat runner.
- `eval/canonical-delegation.ts` — Phase 6 delegation scenarios harness.
- `eval/viewer/viewer.html` — Phase 7 single-file viewer.
- `eval/.runs/` — example artifact layout.
- `.github/workflows/production-loop.yml` — Phase 9 CI cron.
- `tests/production-loop-real-worker.test.ts` — Phase 3 fake-worker guard.

Vertical agents adopt the same shape with domain-specific knowledge corpora —
for example a content agent, a tax agent, or a research agent will each mount
Phase 2 ingestion (`src/server/ingestion/{client,redact,trace-store}.ts`) and
a Phase 5 knowledge namespace (`src/server/agent-knowledge/index.ts`) tuned to
their domain. An on-chain coder-driver blueprint is the original MCP pattern
that inspired the substrate; read it for context only, the substrate has
subsumed its patterns.

## Key docs

- [`agent-eval-adoption`](../agent-eval-adoption/SKILL.md) — substrate
  primitives, traces, judges, scorecard, ship-gate. Pair with this skill.
- `@tangle-network/agent-interface@0.10.x` — the NEUTRAL contract beneath the
  stack: `AgentProfile`, `AgentProfileMcpServer`, `HarnessType`, `ReasoningEffort`,
  `Part`, `ToolPart`, plus the capability layer (`harnessSupportsModel`,
  `reasoningEffortsFor`, `reasoningLadder`). Import the profile types from here.
- `@tangle-network/agent-runtime@0.70.x` README + subpaths `/loops` +
  `/profiles` + `/mcp` + `/agent` + `/intelligence`. The `/loops` subpath (the
  published `src/runtime/` barrel) carries the `runLoop` kernel,
  `Scope`/`Supervisor` + combinators, the `TraceSource` family, and the generic
  coder surface (`worktreeFanout`/`gateOnDeliverable`) — NOT the package root.
  `createOtelExporter` + the `improvementDriver` family are at the root. (There
  is no `/runtime` export subpath; `/analyst-loop` is documented by the repo but
  not yet declared in `exports` — see the analyst-loop caveat above.) Peers
  `agent-eval >=0.93.0 <1.0.0` (pin `^0.95.0`), `agent-interface >=0.10.0 <1.0.0`,
  `agent-knowledge >=1.7.0 <2.0.0`, `sandbox >=0.8.0 <1.0.0`.
- `@tangle-network/agent-eval@0.95.x` README + subpaths `/contract` + `/matrix` +
  `/multishot` + `/wire` + `/traces`. The loop/proposer/gate primitives —
  `runImprovementLoop` / `runCampaign` / `selfImprove` / `defineAgentEval` /
  `gepaProposer` / `defaultProductionGate` — are on `/contract` (NOT root;
  `runOptimization` is internal). `runAgentMatrix` (`/matrix`), `runMultishot` /
  `runMultishotMatrix` (`/multishot`), `assertRealBackend` / scorecard /
  `proposeAutomatedPullRequest` / `HeldOutGate` (root).
- `@tangle-network/agent-knowledge@1.7.x` README — `searchKnowledge`,
  `proposeFromFindings`, `applyKnowledgeWriteBlocks`, `tokenizeQuery`.
- `@tangle-network/agent-profile-materialize@0.1.x` — `materializeProfile`,
  `WorkspacePlan`, `applyWorkspacePlan` (author the profile → materialize to disk).
- `@tangle-network/sandbox@0.8.2` SDK — `Sandbox`, `SandboxInstance`,
  `SandboxEvent`, `exportTraceBundle`, `toOtelJson`. Re-exports `AgentProfile` /
  `AgentProfileMcpServer` from agent-interface for back-compat (prefer the
  canonical import from agent-interface).

---

## Canonical eval surface — what scripts every product MUST expose

Eval scripts sprawl fast — products accumulate a dozen near-duplicate scripts,
plus two-pointing-at-the-same-file bugs. Standardize on a single canonical
surface so consumers can swap between products without re-learning the CLI.

**Required scripts** (every product exposes these by name):

| Script | What | Owner module |
|---|---|---|
| `eval` | Canonical single-shot persona-driven eval. One scenario or all. | per-product `eval/canonical.ts` or `tests/eval/canonical.ts` |
| `eval:multishot` | Single multi-turn driver-agent run (debug + iterate before matrix) | `@tangle-network/agent-eval/multishot` |
| `eval:matrix` | Sweep `AgentProfile[] × persona[] × reps`. The quality dashboard. | `@tangle-network/agent-eval/multishot` `runMultishotMatrix` |
| `eval:improve` | Analyst loop — reads production traces → findings | `@tangle-network/agent-runtime/analyst-loop` `runAnalystLoop` |
| `eval:calibrate` | Calibrate judge models against gold data | per-product |
| `eval:optimize` | Mutator generates N candidates + matrix scores them + gate decides | `@tangle-network/agent-eval/contract` `runImprovementLoop` (the `/contract` subpath; the inner `runOptimization` is internal-only, no longer exported) |
| `eval:production-loop` | Scheduled job: improve + optimize + gate + open PR. Different from `eval:optimize` — adds the cron + PR-opening layer. | per-product `scripts/evals/run-production-loop.ts` |
| `eval:viewer` | Single-file HTML viewer of any run artifact | per-product `eval/viewer/serve.mjs` |

**Optional scripts** (domain-specific, name freely):

- `eval:redteam` — adversarial scenarios
- `eval:delegation` — agents-call-MCP-tools-as-tests
- `eval:harvest` — pull gold items from production traces
- `eval:video-*`, `eval:product`, `eval:dual` — per-domain extensions

**Forbidden:**

- **Two scripts pointing at the same .ts file** — pick one canonical name and delete the other. If `eval:optimize` and `eval:production-loop` resolve to the same file, that's a bug, not a feature.
- **`eval:evolve` as a separate script** — prompt evolution belongs inside `eval:optimize` (it's one of the mutator strategies). Keep the legacy script as a thin alias for one minor, then delete.
- **`eval:driver` as a separate script** — multi-turn driver-agent IS `eval:multishot`. Rename one-off `eval:driver` scripts to `eval:multishot` so the substrate's pattern propagates.

**Cross-references:**

- This skill's Phase 7 — how to wire multishot + matrix on the substrate.
- agent-eval-adoption skill — the substrate primitives for each script.

---

## Phase 10 — full distributed tracing + OTEL export

**Goal:** every LLM call across the entire self-improvement loop — agent
turns, judges, analysts, mutators, MCP dispatches, worker sandboxes,
validators — emits spans into one joinable trace tree. When the user sets
`OTEL_EXPORTER_OTLP_ENDPOINT`, ALL of those spans export to their
observability stack (Langfuse, Datadog, Honeycomb, custom collector).

**Why it matters:** you cannot improve the improver if the improver is
opaque. When the production-loop fails to converge, you need to debug WHY:
did the judge mis-score? did the analyst misdiagnose the failure surface?
did the mutator produce a non-sequitur? Without per-call spans, each is a
black box. Customer-facing deployments REQUIRE OTEL — observability is not
optional infra.

**Files:**

- agent-runtime 0.70+ exports `createOtelExporter()` from the package root. The
  sandbox side exports `exportTraceBundle` + `toOtelJson` for worker-box trace
  export. (`withOtelPipeline` is NOT an agent-runtime export — it is an
  agent-EVAL root export; for agent-runtime, wire the exporter directly.)
- agent-eval 0.95+ wraps judge / analyst / mutator LLM calls in spans when an
  OTLP endpoint is configured. Verify the exact span-wrapper names against the
  installed dist before importing them by name.

**Code template — enable end-to-end OTEL:**

```ts
// At the top of any eval/production entrypoint
process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??= 'http://localhost:4318'
// optional: process.env.OTEL_EXPORTER_OTLP_HEADERS = 'authorization=Bearer ${LANGFUSE_PUBLIC_KEY},x-langfuse-secret=${LANGFUSE_SECRET}'

// That's it. Every kernel iteration, every judge call, every analyst run,
// every mutator pass auto-exports.
```

**TraceId propagation through MCP subprocess:**

When the agent harness launches the `agent-runtime-mcp` subprocess for
delegation, it MUST pass `TRACE_ID` + `PARENT_SPAN_ID` env vars so the
subprocess's internal runLoop spans become children of the dispatching
agent's delegation span. Without this, MCP-internal work shows as a
separate trace tree.

```ts
// in the production composer when building the MCP entry:
const mcpEntry: AgentProfileMcpServer = {
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@tangle-network/agent-runtime', 'mcp'],
  env: {
    TANGLE_API_KEY: sandboxApiKey,
    SANDBOX_BASE_URL: baseUrl,
    // OTEL + tracing propagation (set by the kernel at delegation dispatch time):
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? '',
    TRACE_ID: ctx.traceEmitter?.traceId ?? '',
    PARENT_SPAN_ID: ctx.traceEmitter?.currentSpanId ?? '',
  },
  enabled: true,
}
```

**Worker sandbox trace export:**

After any worker sandbox (delegated coder / researcher) completes, call
`exportTraceBundle(box)` and merge events into the parent trace store with
`parentSpanId` pointed at the delegation's loop.iteration span. The
sandbox SDK exports this helper at `@tangle-network/sandbox`. Without this
the worker's internal LLM calls + tool calls live ONLY inside the
sandbox process and are lost on teardown.

**Verify:**

```bash
# Local OTEL collector (one-time setup):
docker run -p 4318:4318 otel/opentelemetry-collector:0.95.0

OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 pnpm eval:multishot --persona <id> --profile baseline --turns 6
# Expect: collector logs show per-LLM-call spans with traceId joins.

OTEL_EXPORTER_OTLP_ENDPOINT=https://cloud.langfuse.com OTEL_EXPORTER_OTLP_HEADERS='authorization=Basic ...' pnpm eval:matrix
# Expect: Langfuse UI shows the full matrix run with judge/analyst/mutator child spans.
```

**Anti-patterns:**

- **Opaque judges.** A judge that returns `{score: 0.45}` with no traced
  reasoning chain cannot be debugged. Wrap every judge LLM call in a span
  with input context + output scores + dimensions as span attributes.
- **Disjoint trace trees.** If the agent's chat-turn trace and the MCP
  subprocess's trace have different traceIds, you can't query "show me the
  full causal chain of THIS user message". Propagate traceId via env at
  every subprocess boundary.
- **OTEL as opt-in extra.** When `OTEL_EXPORTER_OTLP_ENDPOINT` is set,
  EVERYTHING must auto-export with no further code changes. If a call site
  bypasses the exporter, that span is missing from the user's dashboard —
  silently. Audit every LLM call for span wrapping.
- **Worker sandbox traces dropped on teardown.** Call `exportTraceBundle`
  in a `finally` block; tearing down the sandbox without exporting loses
  every internal LLM call the worker made.

**Cross-references:**

- agent-runtime 0.70.x `createOtelExporter` source (package root).
- agent-eval 0.95.x judge + analyst + mutator span wrappers.
- `@tangle-network/sandbox` `exportTraceBundle` + `toOtelJson` helpers.
- Phase 7 multishot — every conversation step emits spans; matrix-level
  spans wrap the cell execution.
