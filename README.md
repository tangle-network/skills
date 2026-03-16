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
```

Or browse and install:

1. Select `Browse and install plugins`
2. Select `tangle-network-skills`
3. Choose a plugin
4. Select `Install now`

## Available Plugins

| Plugin | Description |
|--------|-------------|
| [sandbox-product](./plugins/sandbox-product/) | Build products on the Sandbox SDK -- direct-connect streaming, token auth, Cloudflare Workers deployment |
| [sandbox-blueprint](./plugins/sandbox-blueprint/) | Build sandbox-style blueprints -- provisioning, lifecycle, operator API, auth, secrets, TEE, GC |
| [tangle-blueprint-expert](./plugins/tangle-blueprint-expert/) | Expert workflow for building Tangle Blueprints -- SDK patterns, BSM hooks, CLI lifecycle, production runtime |
| [blueprint-frontend](./plugins/blueprint-frontend/) | Build React frontends for blueprints -- job submission, operator discovery, session auth, agent chat/terminal |
| [tangle-branded-designer](./plugins/tangle-branded-designer/) | Tangle brand design system and visual guidelines |
| [plan-mega-review](./plugins/plan-mega-review/) | Garry Tan's Mega Plan Review Mode with three scope modes and 10-section review gates |

For internal skills (sidecar internals, provider architecture), see [tangle-network/skills-internal](https://github.com/tangle-network/skills-internal) (private).

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
