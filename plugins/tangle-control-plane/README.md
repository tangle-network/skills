# Tangle Control Plane

Connect this agent (Claude Code, Codex, Cursor, …) to your Tangle account over MCP: discover and invoke your connected integrations (Gmail, GitHub, Slack, …), and author, run, and observe workflows — no web UI needed.

Installing this plugin registers the `tangle-control-plane` MCP server and a thin skill that teaches the tool loops. One install; no hand-wiring `claude mcp add`.

## Setup (one time)

1. **Get an API key.** From the Tangle dashboard (Settings → API keys), mint a **user-owned** `sk-tan-…` key with the scopes you need:
   - `read` — observe workflows / runs / integrations
   - `workflows:write` — create / update / run workflows
   - `integrations:invoke` — invoke integrations
   - `admin` — everything, incl. `author_workflow` + key management

   A good default for authoring + running: `read`, `workflows:write`, `integrations:invoke`.

2. **Export it** in the environment you launch the agent from:
   ```bash
   export TANGLE_API_KEY=sk-tan-...
   ```
   The plugin's `.mcp.json` reads `${TANGLE_API_KEY}` at connection time — no secret is stored in this repo. If it is unset, the server connects with an empty token and auth fails.

3. **(Optional) Point at a non-prod deployment.** The endpoint defaults to `https://id.tangle.tools/mcp`. Override the base with `TANGLE_HUB_URL` (no trailing slash):
   ```bash
   export TANGLE_HUB_URL=http://localhost:4100
   ```

4. **Verify.** Run `/mcp` in the agent — `tangle-control-plane` should be connected. The public health check is:
   ```bash
   curl "${TANGLE_HUB_URL:-https://id.tangle.tools}/mcp/info"
   ```
   JSON back = endpoint live. `404` = the deployment has not enabled the endpoint (`CONTROL_PLANE_MCP_ENABLED`).

## What you get

- **Integrations** — `list_integrations`, `search_integration_actions`, `describe_integration_action`, `invoke_integration`
- **Workflows** — `get_workflow_schema`, `validate_workflow`, `create_workflow`, `run_workflow`, `get_workflow_run`, `list_workflow_runs`, `update_workflow`, `author_workflow`, …
- **Skills, usage, keys, and account-level sandbox management** — the rest of the control-plane toolset, scope-gated.

The bundled skill teaches the discover→invoke and author→run→observe loops and the known footguns (model slugs are not validated at author time; discover integration paths, never guess).

## Troubleshooting

- **Server won't connect / no tools** — confirm `TANGLE_API_KEY` is exported in the launching shell; check `/mcp/info` returns JSON.
- **`401` / scope errors** — the key is missing a scope (add it) or is a team key (must be user-owned).
- **`invoke_integration` blocked** — the account balance must be positive; the endpoint rate-limits at 120 rpm/key.

## Roadmap

- OAuth on the endpoint, so no API key is needed (browser sign-in on first use).
- Server-provided MCP `instructions`, so connecting alone seeds tool-use guidance.
