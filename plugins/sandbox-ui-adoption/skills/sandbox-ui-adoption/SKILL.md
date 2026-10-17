---
name: sandbox-ui-adoption
description: Adopt sandbox-ui and brand tokens; replace copied UI and verify the rendered product.
---

# Sandbox UI Adoption

Adopt the maintained Tangle design system without copying its values or creating a second application shell. This entrypoint covers existing consumers and the UI foundation of new products.

## Establish authority and compatibility

Read the [Brand design bible](https://github.com/tangle-network/brand/blob/main/docs/design-bible.md) and its [implementation contracts](https://github.com/tangle-network/brand/blob/main/docs/brand-guidelines.md). Then read the current [package ownership and composition contract](https://github.com/tangle-network/sandbox-ui/blob/main/UI-DIRECTION.md).

The dependency direction is Brand → UI → Sandbox UI → Agent App → product. Generic controls belong in UI, technical panes in Sandbox UI, and the composed agent shell, transcript, composer and pickers in Agent App. Product adapters own routes, authoritative data, authorization and domain composition. Follow the linked owners for current symbols and exact boundaries.

Inspect the consumer's package manifests, lockfile, stylesheet imports and installed exports/types before choosing APIs. Current source documentation does not prove that an installed version contains an API or that a release has been published. Do not copy version pins, token tables, CSS values or an API catalog into this skill.

Prefer verified local checkouts and installed package documentation. If remote guidance or a registry lookup is unavailable, retain the existing working cohort, inspect local sources, and report what could not be verified. Do not guess a version, force peer overrides or start an unsupported upgrade to work around missing evidence.

## Choose the existing composition

- New agent products start with the current [official scaffolder](https://github.com/tangle-network/agent-app/blob/main/create-agent-app/README.md) when it supports their runtime and deployment target. Confirm the selected published generator actually includes the required template.
- Agent workspaces use the [maintained workspace composition](https://github.com/tangle-network/agent-app/blob/main/examples/default-workspace.md).
- Reports, lists, operational pages and settings follow the relevant [product surface guide](https://github.com/tangle-network/agent-app/blob/main/docs/product-surfaces.md) and installed public APIs.
- Technical workbenches compose the existing panes through the product's shell. A generic page-spacing primitive is optional; it is not a mandatory wrapper for every product surface.
- Public and editorial pages follow Brand's task-specific visual direction. Product themes preserve the meaning of status, category and action roles.

Use product-surface guidance for domain composition, not as an independent token or motion authority. In particular, do not adopt its branch-era motion table or animation-end completion assumption; follow [Brand's explicit conflict resolutions](https://github.com/tangle-network/brand/blob/main/docs/design-rule-reconciliation.md#eight-inventory-conflicts) and verify the installed implementation.

## Migrate one complete flow

1. Record the current route, starting state, user task, installed cohort and rendered baseline. Identify copied components, local token overrides and competing behavior.
2. Map each replacement to an existing public export and owner. Preserve product routes, authenticated navigation, permissions, persistence and meaningful product variation.
3. Make the smallest coherent dependency update only when needed. Verify publication and peer compatibility, update the lockfile together, and use the package's maintained styling instructions. Fix shared causes upstream instead of patching their appearance per product.
4. Replace the old path and check its callers. Keep a deliberate compatibility adapter only while a real consumer needs it. Do not remove an API or reader merely because a search returned no result in one repository.
5. Exercise the same flow after adoption, including narrow layout, keyboard focus, supported themes, relevant interruption and failure recovery. Verify the actual artifact or committed result.

Use the existing [drift ratchet](https://github.com/tangle-network/brand/blob/main/docs/drift-ratchet.md) and consumer checks for their documented scope. A bounded source count does not certify visual quality or user success; do not raise a baseline to conceal new drift.

## Acceptance and handoff

Apply the [Brand evidence contract](https://github.com/tangle-network/brand/blob/main/docs/design-evidence-contract.md). Keep functional results, independent craft critique and target-user evidence separate. Review the rendered composition rather than treating every Storybook story as approved design.

Report exact installed versions, imported owners, removed competing paths, retained adapters, before/after evidence, tested states and remaining limits. If delivery includes release and adoption, verify the published artifact and then the served consumer. An upstream merge alone does not finish a company-wide rollout.
