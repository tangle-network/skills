---
name: tangle-branded-designer
description: Apply Tangle's brand system to product and marketing UI, then review the rendered result.
---

# Tangle Branded Designer

Use this entrypoint for Tangle product and marketing design. Brand owns the design decisions; this skill owns the workflow for applying them.

## Read the current owners

1. Read the [Brand design bible](https://github.com/tangle-network/brand/blob/main/docs/design-bible.md) for identity, copy, visual grammar, interaction, motion and acceptance.
2. Follow its [implementation contracts](https://github.com/tangle-network/brand/blob/main/docs/brand-guidelines.md) for themes, semantic tokens and shared component ownership.
3. For product UI, read the [UI ownership and composition guide](https://github.com/tangle-network/sandbox-ui/blob/main/UI-DIRECTION.md) and the relevant [product surface](https://github.com/tangle-network/agent-app/blob/main/docs/product-surfaces.md). Confirm APIs against the installed package's exports and types.

Use product-surface guidance for domain composition, not as an independent token or motion authority. In particular, do not adopt its branch-era motion table or animation-end completion assumption; follow [Brand's explicit conflict resolutions](https://github.com/tangle-network/brand/blob/main/docs/design-rule-reconciliation.md#eight-inventory-conflicts) and verify the installed implementation.

Use a verified local checkout of these sources when available; record its revision. If remote sources are unavailable, use the project's pinned or already-reviewed local guidance and existing components. Report missing authority and defer new brand decisions rather than inventing a replacement palette or blocking unrelated source inspection.

Do not copy token values, font scales or motion recipes into this skill or a product stylesheet. Historical screenshots and older skill copies are evidence, not a competing source of current policy. Product-specific composition and recovery still belong to the product.

## Start with the work

Identify the audience, task, useful artifact, next decision and supported states before drawing the screen. Read the unresolved product complaints and inspect the closest maintained product or reference the user approved.

For an existing surface, capture the real flow's desktop and phone baseline before editing, including the relevant states. Record the route, source revision and fixture so the after evidence is comparable. For a new surface, identify the maintained reference and mark the absence of a prior consumer baseline.

For a new agent product, inspect the current [maintained starter](https://github.com/tangle-network/agent-app/blob/main/create-agent-app/README.md) and [default workspace](https://github.com/tangle-network/agent-app/blob/main/examples/default-workspace.md). Start from the supported shared composition; do not rebuild its shell, composer, pickers or primitives.

For a major redesign, follow the bible's direction-comparison and approval requirements using the same real task and content. Small corrections keep the established direction. An available product-design skill can supply inspection and prototyping methods; it does not override Brand.

## Implement at the owner

Map each changed control and state to its existing shared component. Fix reusable behavior in its owning package, then adopt the verified release in consumers. Preserve product routes, permissions, data, named themes and domain meaning. Make unsupported capabilities absent or explicitly unavailable, never decorative controls with no real action.

Use real product output for proof. Keep illustrative concepts clearly identified. Marketing, operational work and long reading need compositions suited to their jobs; do not force one hero, card grid or page wrapper onto every surface.

## Prove the result

Exercise the real changed flow at desktop and phone widths, in supported themes, with keyboard and relevant reduced-motion behavior. Include meaningful pending, empty, error and recovery states. For an artifact flow, open, use and reopen the actual result; a chat claim or filename is not proof of saved content.

Inspect screenshots for static changes and interaction recordings for changed behavior. Follow the [Brand evidence contract](https://github.com/tangle-network/brand/blob/main/docs/design-evidence-contract.md): functional assertions, independent craft review and target-user results remain separate. A build, Storybook catalog or drift pass cannot establish exceptional UX.

Report source and installed versions, the decision, changed owners, rendered evidence, tested states and unresolved limits. Verify the served revision and live flow when deployment is in scope; keep unrun proof explicit.
