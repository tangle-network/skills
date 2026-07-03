# Tangle Network Skills

Claude Code plugin marketplace for Tangle Network development skills.

## Installation

Add this marketplace to Claude Code:

```
/plugin marketplace add tangle-network/skills
```

Then install individual plugins:

```
/plugin install tangle-blueprint-expert@tangle-network-skills
/plugin install sandbox-product@tangle-network-skills
/plugin install tangle-branded-designer@tangle-network-skills
```

Or browse and install:

1. Select `Browse and install plugins`
2. Select `tangle-network-skills`
3. Choose a plugin
4. Select `Install now`

## Available Plugins

| Plugin | Description |
|--------|-------------|
| [agent-eval-adoption](./plugins/agent-eval-adoption/) | Adopt `@tangle-network/agent-eval` and `@tangle-network/agent-runtime` in products with real trace capture, scorecards, promotion gates, and prompt optimization |
| [agent-stack-adoption](./plugins/agent-stack-adoption/) | Adopt the full self-improving Tangle agent stack across runtime, knowledge, evals, sandbox, tcloud, matrix tests, and CI |
| [blueprint-frontend](./plugins/blueprint-frontend/) | Build React frontends for blueprints -- job submission, operator discovery, session auth, agent chat/terminal |
| [plan-mega-review](./plugins/plan-mega-review/) | Garry Tan's Mega Plan Review Mode with three scope modes and 10-section review gates |
| [sandbox-blueprint](./plugins/sandbox-blueprint/) | Build sandbox-style blueprints -- provisioning, lifecycle, operator API, auth, secrets, TEE, GC |
| [sandbox-product](./plugins/sandbox-product/) | Build products on the Sandbox SDK -- direct-connect streaming, token auth, Cloudflare Workers deployment |
| [site-clone](./plugins/site-clone/) | Clone or migrate websites into self-hosted frontend frameworks using ripped CSS, fonts, assets, DOM structure, and screenshot verification |
| [soc2-audit](./plugins/soc2-audit/) | Run SOC 2 readiness audits across infrastructure, code security, Trust Service Criteria mapping, and remediation plans |
| [tangle-blueprint-expert](./plugins/tangle-blueprint-expert/) | Expert workflow for building Tangle Blueprints -- SDK patterns, BSM hooks, CLI lifecycle, production runtime |
| [tangle-blueprint-iframe-app](./plugins/tangle-blueprint-iframe-app/) | Build hosted blueprint product UIs that embed safely in Tangle Cloud with iframe mode, parent-bridged wallet flows, manifests, and frame headers |
| [tangle-blueprint-innovate](./plugins/tangle-blueprint-innovate/) | Turn blueprint ideas, categories, or half-built repos into research-grounded, multi-operator specs ready for execution |
| [tangle-branded-designer](./plugins/tangle-branded-designer/) | Tangle brand design system and visual guidelines |
| [tangle-control-plane](./plugins/tangle-control-plane/) | Connect Claude Code to your Tangle account over MCP -- invoke connected integrations (Gmail/GitHub/Slack) and author, run, and observe workflows, with a skill that teaches the tool loops |

For internal skills (sidecar internals, provider architecture), see [tangle-network/skills-internal](https://github.com/tangle-network/skills-internal) (private).

## Public vs. Internal

This repository is for portable public workflows: public SDK usage, blueprint architecture, frontend patterns, product UI guidance, and synthetic examples. Keep private infrastructure, credentials, customer data, GTM source material, live account IDs, local hostnames, raw traces, and unpublished product posture in `tangle-network/skills-internal` or private project docs.

## Manual Installation

Clone this repo and symlink skills into `~/.claude/skills/`:

```bash
git clone https://github.com/tangle-network/skills.git
ln -s /path/to/skills/plugins/sandbox-product/skills/sandbox-product ~/.claude/skills/sandbox-product
ln -s /path/to/skills/plugins/tangle-blueprint-expert/skills/tangle-blueprint-expert ~/.claude/skills/tangle-blueprint-expert
```

## Contributing

Each plugin follows the standard structure:

```
plugins/
  plugin-name/
    .claude-plugin/
      plugin.json        # name, description, author
    README.md            # plugin overview
    skills/
      skill-name/
        SKILL.md         # skill definition (frontmatter + instructions)
        references/      # supporting docs, code examples
```

See the [Agent Skills spec](https://agentskills.io/specification) for the SKILL.md format.
