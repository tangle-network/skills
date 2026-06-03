---
name: build-agent-app
description: "Adopt @tangle-network/agent-app — the shared application-shell framework for agent products — either greenfield (new product) or by migrating an existing app (from ANY stack). Starts with a discovery interview (product surface, agent surface, eval surface, features, sandbox-or-not, billing, integrations), then routes to the right module set + path. Covers the engine/shell/domain layering rule, per-module seams, sandbox AND non-sandbox (browser/edge copilot) wiring, the migration lift-loop, and anti-patterns. Use when standing up a new agent product, deciding what belongs in the app vs the framework, or porting an existing app onto agent-app."
---

# Adopt agent-app — build new or migrate, on the shared app shell

`@tangle-network/agent-app` is the application-**shell** framework for agent products. The substrate packages (`@tangle-network/{agent-eval, agent-runtime, agent-integrations, tcloud, sandbox}`) are the *engine*; agent-app is the opinionated assembly every product otherwise rebuilds: a structured agent→app tool side channel (human-in-the-loop approvals, dated follow-ups, generated UI, grounded citations), the bounded chat tool-loop, capability auth, model config, per-workspace billing, integration-hub wiring, field crypto, SSE normalization, an eval bridge, and self-service login. Products supply **domain** through typed seams.

## Step 0 — DISCOVER (always start here; do not write code until these are answered)

Interview the stakeholder (or read the existing app) for:

1. **Product surface** — what is it? back-office automation, a customer-facing chat product, an in-app copilot, a batch/workflow runner?
2. **Agent surface** — pick per surface (an app can have both):
   - **Sandboxed agent** — long-running, owns a container, file/tool access, delegated work. Uses the sandbox profile + per-turn MCP servers.
   - **Browser / edge copilot** — lightweight inference, no container. Wires `streamTurn` to the model directly (Tangle Router / tcloud SDK / Vercel AI SDK). **agent-app fully supports this — the runtime loop + tool side channel are sandbox-free.**
3. **Eval surface** — full campaign (personas, traces, judges, scorecards via agent-eval) / an inline completion gate / none yet?
4. **Product features** (each maps to a module): human-in-the-loop approvals? dated cadence/reminders? generated UI? grounded citations? which integrations (providers)? per-user/workspace billing? PII at rest? delegated long-running research/build?
5. **Path** — greenfield, or migrating an existing app? If migrating, **from what stack** (anything — a forked agent app, Next/Remix/Express, a notebook)? What's already hand-rolled vs missing?

Discovery output = the **module set** (below) + the **path** (greenfield §A / migration §B).

## The layering rule (governs every decision)

> **Does the capability make sense without THIS app's tool side-channel / approval queue / chat route?**
> **Yes → ENGINE** → it's in (or belongs in) `agent-eval`/`agent-runtime`/`agent-integrations`/`tcloud`/`sandbox`; consume it (peer-dep), and if it's missing there, **contribute it down** — never fork it.
> **No → agent-app shell.** **Domain** (the product's nouns, prompts, schema, taxonomy) → **your app.**

Corollary — **extend, never duplicate.** Before writing anything that completes, scores, loops, parses a tool name, encrypts, or talks to a hub, check the engine's exports. Reimplementing an engine primitive (e.g. completion/scoring that agent-eval already exports) is the cardinal sin — the weaker copy drifts.

## Module set (map discovery answers to these)

| Need | Module | Seam you supply |
|---|---|---|
| Human-in-the-loop approvals + structured actions | `/tools` | `AppToolHandlers` (persist to your store) + `AppToolTaxonomy` (your action types) + `verifyToken` |
| Dated cadence / generated UI / grounded citations | `/tools` (`schedule_followup` / `render_ui` / `add_citation`) | same handlers |
| Chat turn loop (sandbox OR browser) | `/runtime` `streamAppToolLoop` / `runAppToolLoop` | `streamTurn` (wrap any backend) + `executeToolCall` |
| Model config (Tangle Router / BYOK) | `/runtime` `resolveTangleModelConfig` | env |
| Eval | `/eval` | `producedFromToolEvents` bridge + re-exports agent-eval's `verifyCompletion`/`weightedComposite` (peer-dep) |
| Integration-hub actions | `/integrations` | peer-dep `agent-integrations` + `apiKeyResolver` |
| Per-workspace budget-capped billing | `/billing` | key store + crypto + tcloud provisioner seams |
| Field PII crypto | `/crypto` | the encryption key |
| Web boundary (body/context/rate-limit/headers) | `/web` | KV (rate-limit) |
| PII redaction / SSE normalization | `/redact` / `/stream` | — |
| Self-service login → broker token | `/tangle` | the apps client |
| Delegated long-running work (**sandbox only**) | `/delegation` | platform key |
| Sandbox MCP server entries (**sandbox only**) | `/tools` `buildAppToolMcpServer` / `buildHttpMcpServer` | token + ctx |

## Agent surface — sandbox vs browser/edge copilot

Both consume the SAME `/tools`, `/runtime`, `/eval`, `/billing`, `/crypto`. They differ only in how the agent reaches the tools:

- **Sandboxed**: the in-container agent calls per-turn **MCP servers** (`buildAppToolMcpServer`) over HTTP; the app's routes (`handleAppToolRequest`) execute them. Delegated work via `/delegation`.
- **Browser / edge copilot (no sandbox)**: the app runs the loop in-process — `streamAppToolLoop({ streamTurn, executeToolCall, … })` where `streamTurn` wraps the **Tangle Router** (`resolveTangleModelConfig`) / **tcloud SDK** / **AI SDK** call directly, and `executeToolCall` routes to `createAppToolRuntimeExecutor(handlers)`. No container, no MCP. The structured side channel, billing, crypto, and eval bridge all still apply. (`/delegation` + the MCP-server builder are simply not used.)

## §A — Greenfield

1. **Scaffold** a fresh app (don't copy another agent app). `pnpm add @tangle-network/agent-app` + the engine peers you need.
2. **Domain model** — your store/schema, prompts, the action taxonomy.
3. **Wire the module set** from discovery: implement `AppToolHandlers` against your store; mount `/tools` routes (and MCP servers if sandboxed); drive `/runtime`; add `/billing`,`/integrations`,`/tangle`,`/eval` as features dictate.
4. **Verify** — typecheck/test/build green; real tests at the boundaries (a tool call lands a real row; the loop drives a model tool_call to a real effect).

## §B — Migration (from ANY existing app)

The trace-proven loop — keep the app's tests **green at every step**:

1. **Audit + classify** every server module: **ENGINE** (→ peer-dep the substrate) · **SHELL** (→ lift to / consume from agent-app) · **DOMAIN** (→ keep) · **DEAD** (→ delete — fork-inherited cruft is often the single biggest win; verify zero importers first).
2. **Delete the dead** first (free compression, zero behavior change, prove it green).
3. **Lift shell concerns in dependency order.** Per concern: import the agent-app module → supply the seam (handlers/taxonomy/verifyToken/store/resolver) → **delete the local implementation, leaving a thin shim that preserves the public names callers use** → run the suite → green or revert. Preserve exact wire details (header names, error codes, token prefixes) in the shim.
4. **One class identity for shared errors** — import the framework's error type, don't keep a local copy (a second `instanceof` class silently misroutes).
5. **De-dupe against engines** — if a lifted thing duplicates an engine export, compose/re-export the engine instead.
6. **What NOT to lift** (it's not shell): domain logic; auth/RBAC bound to your own schema + auth library; substrate *adoption* (trace ingestion is agent-eval, not agent-app); thin domain-content wrappers.

## Anti-patterns

- **Don't fork another agent app.** You inherit its domain leftovers (e.g. one app shipped a *different* domain's filing scripts because it was copy-forked). Start empty, add agent-app.
- **Don't hand-roll the side channel / loop / hub client / token.** They're in agent-app or the engine — compose them; a reimplementation is the weaker copy that drifts.
- **Never scrape structured output from prose** (fenced blocks, regex on the reply). Side effects are validated **tool calls** that return a result the model reads.
- **Keep domain out of the framework** — an action type, a price, a disclaimer, a rubric is a *parameter*, never baked in.
- **Don't bundle the engines** — peerDependency, so the product pins the version (no BOM lock, no forced fleet bump).

## Related skills
- **agent-stack-adoption / agent-eval-adoption** — wiring the substrate *engines* (loops, eval campaigns, ingestion). This skill is the SHELL layer above them.
- **substrate-release** — when you wrote something engine-general here, lift it INTO the engine + publish.
