---
name: tangle-blueprint-iframe-app
description: Build hosted Tangle Blueprint product UIs that embed in Tangle Cloud as sandboxed iframe apps. Use when creating or hardening iframe-mode blueprint apps, postMessage wallet bridges, blueprintUi.externalApp manifests, local iframe catalog entries, Cloudflare frame headers, or Tangle Cloud embedded blueprint app verification.
---

# Tangle Blueprint Iframe App

Use this skill when a blueprint needs a product-specific hosted UI inside Tangle Cloud instead of only the generic `@tangle-network/blueprint-ui` forms.

Do not use it for generic job-form frontends; use `blueprint-frontend` for that. Use this when the app is a hosted product surface with its own route, state model, styling, and parent-bridged wallet/job interactions.

## Read As Needed

1. `references/IFRAME-APP-WORKFLOW.md` - implementation workflow, app shell, local dev, deploy, verification.
2. `references/IFRAME-MANIFEST.md` - `blueprintUi.externalApp` metadata, iframe policy fields, local catalog, mode params.
3. `references/IFRAME-SECURITY.md` - sandbox invariants, bridge validation, headers, kill switches, review checklist.

## Core Contract

1. The iframe never touches `window.ethereum`. Wallet reads, signatures, transactions, typed-data signing, chain switching, and blueprint job calls route through the parent bridge.
2. Every iframe capability is declared in metadata. If a chain, contract, selector, message prefix, or popup permission is not declared, the parent must reject it.
3. The parent validates exact origin and exact iframe source. No wildcard origins, suffix matching, regex trust, or `targetOrigin: '*'`.
4. Production builds do not fake wallet, job, funding, or stream behavior. Local simulation is allowed only behind dev-mode guards that cannot run in production.
5. A shipped app needs both product verification and embed verification: standalone build, iframe local catalog, parent wallet bridge, security headers, and browser screenshots.

## Workflow

1. Define the app contract:
   - `appId`
   - hosted URL and expected origin
   - chain IDs
   - job indexes the iframe may call
   - contract addresses/selectors it may ask the wallet to sign
   - message prefixes and typed-data shapes, if any
   - whether read-account, chain-switch, or popup permissions are needed
2. Pick the UI base:
   - use an existing app if upgrading;
   - otherwise start with Vite + React + TypeScript;
   - use `@tangle-network/blueprint-ui/iframe` bridge hooks when available.
3. Build the product UI around the blueprint's real domain state. Do not ship a generic wallet/chat shell unless that is the product.
4. Add bridge behavior:
   - handshake on load;
   - read connected account/chain through the parent;
   - call blueprint jobs through parent job submission when the product needs on-chain execution;
   - render parent service context and mode changes.
5. Publish metadata with `blueprintUi.externalApp.mode = "iframe"` and an `iframe` permissions block.
6. Add local catalog wiring so Tangle Cloud can load the local dev server during development.
7. Add Cloudflare or equivalent frame headers before deploy.
8. Run verification:
   - production build;
   - local iframe mode in Tangle Cloud;
   - account read/connect flow;
   - one allowed action succeeds;
   - one undeclared action is rejected;
   - desktop and mobile screenshots;
   - console/network health.

## Required Output

Report:

- app URL and `appId`;
- manifest block added or changed;
- declared permissions;
- verification commands and outcomes;
- screenshots or browser evidence locations;
- remaining gaps, especially if a permission was intentionally not granted.

Never report "embedded" or "safe" without proving the app loaded through the parent iframe path.
