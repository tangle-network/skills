# tangle-blueprint-innovate

Idea-to-spec conversation skill for Tangle Blueprints.

Takes one of:
- a one-line idea
- a half-built blueprint repo
- "I want to build a blueprint but don't know what"

Returns a 1-page spec, ready to hand off to `tangle-blueprint-expert`
for execution.

## What it does

1. **Market scan** (optional) — dispatches research sub-agents across
   GitHub Trending, Hacker News, Product Hunt, arxiv, and Twitter to
   find real unmet problems in a category.
2. **Customer archetype lock** — self-hosting / PaaS-for-dev /
   direct-to-end-user. Changes auth, billing, UX fundamentally.
3. **Multi-operator-by-default design** — coordinator selection,
   convergence model, request routing, failure posture.
4. **BSM primitive selection** — map the billing, slashing, and
   lifecycle needs onto existing Tangle / BSM hooks (never invent
   adapter traits).
5. **OSS-wrapping check** — is there a mature OSS library (Hiqlite,
   vLLM, Ollama, Qdrant, ComfyUI, Temporal, etc.) that becomes the
   capability core, with this blueprint wrapping it for multi-op
   settlement + slashing?
6. **Boringness test** — does this do something SaaS can't? If not,
   either sharpen the trust/verifiability angle or kill the idea.
7. **Spec handoff** — tight 1-page spec with filled axes.

## What it does not do

- Write code (`tangle-blueprint-expert` does that)
- Polish marketing (not a pitch deck tool)
- Generate ideas from scratch without user taste input (the operator
  picks categories + archetype; the skill scopes the research)

## Reading order

1. `skills/tangle-blueprint-innovate/SKILL.md` — the three-branch
   conversation flow + triage rubric
2. `references/INNOVATE-CATEGORIES.md` — 28 categories with current
   examples and typical Tangle-shaped problem angles
3. `references/INNOVATE-CUSTOMER-ARCHETYPES.md` — three archetypes
   with auth/billing/UX patterns
4. `references/INNOVATE-MULTI-OP-PATTERNS.md` — coordinator /
   convergence / routing / failure patterns (multi-op is default,
   not an axis)
5. `references/INNOVATE-OSS-WRAPPING.md` — wrapping mature OSS
   libraries as the fastest innovation path
6. `references/INNOVATE-RESEARCH-METHOD.md` — how to dispatch
   research sub-agents across the 5 sources
7. `references/INNOVATE-BORINGNESS-TEST.md` — the in-line SaaS
   gut-check + scoring heuristic

## Related skills

- `tangle-blueprint-expert` — execution skill this hands off to
- `tangle-blueprint-expert/references/TANGLE-BLUEPRINT-BPM-VS-INSTANCE.md` —
  required reading before BSM primitive selection
- `tangle-blueprint-expert/references/TANGLE-BLUEPRINT-BSM-HOOKS.md` —
  the primitive catalog the spec resolves against
