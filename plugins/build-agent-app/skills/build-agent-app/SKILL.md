---
name: build-agent-app
description: "Build a NEW Tangle agent product (insurance/tax/legal/creative/gtm-style) greenfield on @tangle-network/agent-app + the substrate, instead of forking another agent app. Covers the architecture split (substrate engine / agent-app shell / product domain seams), the build phases, and the exact seams each agent-app module needs. Use when standing up a new agent product, scaffolding an agent app from scratch, or deciding what belongs in the app vs the framework. NOT for migrating an existing app — that skill comes later from trace analysis."
---

# Build a new agent app on `@tangle-network/agent-app`

The mistake every Tangle agent product made: it was **forked from another agent app** (insurance forked legal → inherited legal's IRS/FinCEN filing scripts and `:::proposal` fenced blocks). Don't fork. Build greenfield on the shared shell and supply only your domain.

## The three layers (know which one your code belongs in)

1. **Substrate engine** — `@tangle-network/{sandbox, agent-runtime, agent-eval, agent-integrations, agent-knowledge, tcloud}`. Sandbox lifecycle, the driven-loop runtime, the eval campaign framework, the integration hub, knowledge ingestion, billing/keys. You consume these; you never reimplement them.
2. **App shell** — `@tangle-network/agent-app`. The opinionated application layer every product duplicates: the structured agent→app tool side channel, the bounded chat tool-loop, capability auth, the broker-token/login flow, the delegation MCP, the inline eval gate. You consume these and supply seams.
3. **Your product (the app)** — the ONLY place domain code lives: DB schema, prompts, knowledge corpus, skill playbooks, the proposal taxonomy, and the **handlers** that persist to your D1/KV. Everything domain-specific stays here; the shell stays generic.

> Litmus test for "does this belong in the app or the framework?": if it mentions a premium, a policy, a filing, a campaign — it's the **app**. If it's "route a tool call", "mint a token", "run the tool loop", "verify a quote is in a file" — it's already in **agent-app** or the engine; import it.

**The three-layer rule (memorize it — it's the whole game):** *Does the capability make sense without THIS app's tool side-channel / approval / chat route?* **Yes → engine** (`agent-eval`/`agent-runtime`/`agent-integrations`/`tcloud`); if not there yet, contribute it down — never fork it. **No → agent-app.** Domain (premiums, prompts, schema) → **your app**. Reimplementing a primitive the engine already exports (e.g. `verifyCompletion`, `weightedComposite`) is the cardinal sin — the weaker copy drifts. agent-app itself follows this: its `eval` module re-exports agent-eval and keeps only the side-channel bridge. (Full contract: `agent-app/AGENTS.md`.)

## agent-app modules + the seam each needs

| Module | What you get | The seam YOU supply |
|---|---|---|
| `/tools` | `submit_proposal` / `schedule_followup` / `render_ui` / `add_citation` — OpenAI defs, MCP-server builder, HTTP route handler, runtime executor, capability auth | `AppToolTaxonomy` (your proposal `type`s + the regulated subset) + `AppToolHandlers` (4 async fns that write to YOUR db, keyed off `ctx`) + a `verifyToken` (use `createCapabilityToken`/`verifyCapabilityToken`) |
| `/runtime` | `streamAppToolLoop` (streaming) / `runAppToolLoop` (awaitable) — the bounded multi-turn tool loop | `streamTurn` (wrap your `runAgentTaskStream` backend), `executeToolCall` (route integration vs app tool), `extractText`/`extractToolCall`, `isExecutableTool` |
| `/tangle` | `buildConsentUrl` + `createBrokerTokenProvider` (developer app-registration → `sk-tan-broker-` token, cached/auto-refreshed) | the concrete `TangleAppsClient` from `@tangle-network/agent-integrations` + your client_id/secret/grant |
| `/delegation` | `buildDelegationMcpServer` (the agent-runtime driven-loop MCP, opt-in) | your `TANGLE_API_KEY` + trace env to forward |
| `/eval` | `producedFromToolEvents` + `verifyCompletion` + `tokenRecallChecker` + `weightedScore` — the lightweight inline completion gate | your `CompletionRequirement[]` (per-deliverable `satisfiedBy`). For full campaigns/traces/LLM-judge, use `@tangle-network/agent-eval` instead. |

## Build phases

**Phase 0 — scaffold.** New repo: React Router v7 + Cloudflare Workers + D1/Drizzle + KV/R2, `pnpm`. `pnpm add @tangle-network/agent-app` (+ the substrate packages). Do NOT copy another agent app's `src/`.

**Phase 1 — domain model.** Define your D1 schema (the equivalent of `proposedActions`, your entities, your calendar table). Write the system prompt + knowledge corpus + skill playbooks. Define your **proposal taxonomy**: the `type`s your `submit_proposal` accepts and which are regulated (require a named human).

**Phase 2 — wire `/tools`.** Implement `AppToolHandlers` (4 fns that persist to your D1/KV, reading `ctx.workspaceId`/`ctx.threadId`). Then:
- One route file per tool: `export const action = ({ request }) => handleAppToolRequest(request, { tool, handlers, taxonomy, verifyToken, headerNames })`.
- Per-turn MCP servers: `buildAppToolMcpServer({ tool, baseUrl, token, ctx, description, headerNames })` spread into the sandbox profile's `mcp` map.
- `verifyToken` = `verifyCapabilityToken(userId, bearer, { secret: env.CAPABILITY_SECRET, prefix })`; mint with `createCapabilityToken`.

**Phase 3 — wire `/runtime`.** Your chat runtime drives `streamAppToolLoop` (streaming/SSE) or `runAppToolLoop` (drain/eval): advertise `buildAppToolOpenAITools(taxonomy)` on the backend; pass `executeToolCall` that routes hub tools to the integration executor and app tools to `createAppToolRuntimeExecutor`. Add `/delegation` if the agent should dispatch long research/build loops.

**Phase 4 — wire `/tangle` (self-service auth).** Register the app once (`TangleAppsClient.registerApp`), persist the client_secret. On first user use, redirect through `buildConsentUrl` → exchange the `agc_` code for a grant → `createBrokerTokenProvider({ client, clientId, clientSecret, grantId })`. Use `provider.getToken()` as the hub bearer per `/v1/hub/exec`. No hard-coded "trusted app" registration.

**Phase 5 — eval.** Lightweight gate: feed your turn's produced events through `producedFromToolEvents` → `verifyCompletion(requirements, produced)`. For a real campaign (adversarial personas, traces, LLM-judge, held-out promotion) stand up `@tangle-network/agent-eval` (see the `agent-stack-adoption` / `agent-eval-adoption` skills).

**Phase 6 — verify.** `pnpm typecheck && pnpm test && pnpm build`. Real-D1 route tests (miniflare via the eval platform harness), an MCP-injection assertion, a loop test that proves a model tool_call → real row + produced event.

## Anti-patterns (these are why the fork-debt exists)

- **Don't fork another agent app.** You inherit its domain leftovers (the insurance sandbox shipping IRS/FinCEN scripts is the cautionary tale). Start empty, add agent-app.
- **Don't hand-roll the side channel.** No bespoke proposal route, capability HMAC, MCP-server shape, or tool loop — they're all in agent-app, tested. Reimplementing = the weaker copy that drifts.
- **Never emit fenced `:::` blocks.** The structured side channel is validated TOOL CALLS. A described/“emitted” block routes nothing; a tool call is validated and returns a result the model must read.
- **Keep domain out of the framework.** If you're tempted to add a proposal `type` or a premium field to agent-app, stop — it goes in your taxonomy/handlers. agent-app imports no product code.
- **Don't downgrade your eval.** If you run full agent-eval campaigns, keep them; `/eval` is the *lighter* inline gate, not a replacement.

## Reference consumer

`~/code/insurance-agent` is the canonical consumer: `src/lib/.server/tools/app-tool-runtime.ts` (taxonomy + handlers + the runtime executor delegation), the four `src/routes/api.tools.*` route one-liners, `src/lib/.server/integrations/capability.ts` (token delegation), `src/lib/.server/sandbox/index.ts` (MCP-server + delegation builders), and `agent-runtime/chat.ts` (the `streamAppToolLoop` adoption). Read those for the exact wiring.

## Related skills
- **agent-stack-adoption / agent-eval-adoption** — wiring the substrate engine (runtime loops, eval campaigns, knowledge ingestion). This skill is the SHELL layer above them.
- **substrate-release** — when you find something you hand-rolled here that every app needs, lift it INTO agent-app and publish.
- (later) **migrate-to-agent-app** — porting an EXISTING forked app onto agent-app. Author it after trace-log analysis of this greenfield path proves the wiring; this skill is greenfield-only.
