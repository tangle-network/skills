# Iframe App Workflow

## App Shape

Use a normal frontend app, usually Vite + React + TypeScript, deployed to an app-specific subdomain such as:

```text
https://myapp.blueprint.tangle.tools/
```

The app should work in two modes:

- `bridge`: running inside Tangle Cloud, receiving account, chain, service, mode, and job results from the parent.
- `dev`: running standalone for local UI iteration. Dev mode may use canned streams or sample state, but production builds must not fake live behavior.

When `@tangle-network/blueprint-ui/iframe` is available, prefer its bridge hooks instead of writing raw `postMessage` code in every app:

```tsx
import { useTangleMode, useTangleWallet } from '@tangle-network/blueprint-ui/iframe'

export function App() {
  const mode = useTangleMode()
  const wallet = useTangleWallet()

  return (
    <main>
      <header>{mode === 'bridge' ? 'Embedded in Tangle Cloud' : 'Local preview'}</header>
      <p>{wallet.address ? wallet.address : 'Connect in Tangle Cloud'}</p>
    </main>
  )
}
```

## Bridge Behavior

The iframe-to-parent protocol is request/response with a correlation ID. The supported request classes are:

- handshake;
- read account;
- request wallet connection;
- switch chain;
- sign message;
- sign transaction;
- sign typed data;
- call blueprint job.

The parent may also broadcast:

- account changes;
- chain changes;
- service context;
- job result chunks.

Keep app state resilient: the iframe can mount before a wallet is connected, before operators are known, or before a selected service exists.

## Local Development

Run the iframe app and the Tangle Cloud parent separately:

```bash
# In the blueprint app repo
pnpm install
pnpm dev

# In the Tangle Cloud dapp repo
BLUEPRINT_UI_USE_LOCAL_IFRAMES=true yarn local:blueprint-ui-catalog
VITE_BLUEPRINT_IFRAME_ENABLED=true VITE_FORCE_LOCAL_CHAIN=true yarn nx serve tangle-cloud
```

The local catalog is the source of truth for mapping a blueprint app to a localhost URL during development. Add an entry for the new app's `appId` or curated blueprint slug when needed.

## Deploy

Cloudflare Pages is the default hosted-app target:

```bash
pnpm build
wrangler pages project create myapp --production-branch=main
wrangler pages deploy dist --project-name=myapp --branch=main
```

Use the actual output directory for the framework. Remix or React Router builds may use `build/client`; Vite defaults to `dist`.

## Headers

Add a `_headers` file to the deployed output:

```text
/*
  Content-Security-Policy: frame-ancestors https://cloud.tangle.tools https://app.tangle.tools https://apps.tangle.tools
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=()
  Referrer-Policy: no-referrer
  X-Content-Type-Options: nosniff
  Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
```

Cookies must be scoped to the iframe app domain only. Never set cookies for the parent registrable domain.

## Verification

Minimum proof before shipping:

1. `pnpm build` passes.
2. Standalone preview renders without console errors.
3. Tangle Cloud local iframe catalog loads the app in an iframe.
4. The iframe reads account/chain through the parent bridge.
5. An allowed wallet/job request succeeds.
6. An undeclared wallet/job request is rejected before user approval.
7. Desktop and mobile screenshots show the app framed correctly.
8. Network logs show no unexpected parent cookie/localStorage access.
