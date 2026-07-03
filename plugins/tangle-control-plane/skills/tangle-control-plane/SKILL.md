---
name: tangle-control-plane
description: Use when driving a Tangle account from this agent — invoking connected integrations (Gmail/GitHub/Slack/…) for one-off actions, or authoring, running, and observing Tangle workflows — via the tangle-control-plane MCP server. Covers the discover→invoke and author→run→observe loops, scopes/auth, and the known footguns.
---

# Tangle Control Plane

This skill assumes the `tangle-control-plane` MCP server is connected (this plugin registers it). It exposes your Tangle account as tools: connected **integrations**, **workflows**, **skills**, usage/billing, and account-level **sandbox** management.

Do not memorize a tool catalog from this file — it drifts. The live sources of truth are the tools themselves (`get_workflow_schema`, `search_integration_actions`, `describe_integration_action`) and `GET {TANGLE_HUB_URL}/mcp/info` (public: current scopes + tool list + health). This skill teaches the **loops** and the **footguns**, not the catalog.

## Golden rule: discover, then invoke

Never guess an integration action path or a model slug. Discover it from a tool first. Guessed paths and invented model slugs are the two most common failures.

## Loop A — one-off integration action

1. `list_integrations` — what the user has connected.
2. `search_integration_actions` — find candidate actions by intent.
3. `describe_integration_action` — get the exact path + input schema.
4. `invoke_integration` — call it with the discovered path and args.

Use this for a single action ("email me the summary", "open a GitHub issue"). For anything recurring, author a workflow instead (Loop B).

## Loop B — author, run, observe a workflow

1. `get_workflow_schema` — the deployment's real authoring capabilities and model catalog. Read it before writing any YAML.
2. `validate_workflow` — dry-run compile the YAML. Fix every reported error.
3. `create_workflow` — save it.
4. `run_workflow` — enqueue; returns `{ runId }`.
5. `get_workflow_run` — poll with `runId` until status is terminal (`succeeded` / `failed` / `cancelled`).
6. `list_workflow_runs` — recent history.

`author_workflow` does create-workflow + mint-skills in one call, but requires the `admin` scope.

## Footguns (all real)

- **Model slugs are not validated at author time.** `agent.run.model` is passed to the router verbatim; an invented or date-suffixed slug passes `validate_workflow` and then hangs at runtime. Copy an exact `provider/model` slug from `get_workflow_schema`'s model list, or omit `model` for the default. Never invent one.
- **Integration paths vary.** It may be `github.issues.create`, not `createIssue`. Never guess — `search`/`describe` first.
- **Validate before you save.** Never `create_workflow` on YAML you have not run through `validate_workflow`.

## Auth & scopes

The server authenticates with `TANGLE_API_KEY` (an `sk-tan-…` key) sent as `Authorization: Bearer`. Tools are gated by the key's scopes:

| Scope | Grants |
|---|---|
| `read` | list / get / validate workflows, runs, integrations, usage |
| `workflows:write` | create / update / run workflows |
| `integrations:invoke` | `invoke_integration` |
| `admin` | wildcard, incl. `author_workflow` + key management |

If a call fails with a scope/auth error, tell the user exactly which scope to add. The key must be **user-owned** (team keys are rejected). `invoke_integration` also needs a positive account balance, and the endpoint rate-limits at 120 requests/min per key.

## When it isn't connected

If `/mcp` shows the server failing or the tools are missing:

- `curl "${TANGLE_HUB_URL:-https://id.tangle.tools}/mcp/info"` — JSON back = endpoint live; `404` = the deployment has not enabled it (`CONTROL_PLANE_MCP_ENABLED`).
- Confirm `TANGLE_API_KEY` is exported in the shell that launched this agent — it expands at connection time; if unset, the Bearer header is empty and auth fails.

See this plugin's README for one-time setup.
