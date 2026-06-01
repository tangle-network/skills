# Iframe Security

## Required Invariants

1. Exact origin equality. Parse the manifest URL and compare `event.origin` to that exact origin.
2. Exact source equality. Check `event.source === iframe.contentWindow`.
3. Typed payload validation before any approval UI.
4. No `targetOrigin: '*'`. Parent and iframe messages must pin the expected origin.
5. Bounded payloads. Reject huge messages, calldata, and correlation IDs before cloning or storing.
6. Wallet isolation. The iframe never receives `window.ethereum`.
7. Declarative permissions. Requests outside `allowedChainIds`, `contracts`, `selectors`, `messages`, or capability flags are rejected before user approval.
8. Popup permission is off by default.

## Request Limits

Use conservative limits unless the parent protocol defines stricter ones:

- message payload: 4 KB;
- calldata: 128 KB;
- correlation ID: 128 ASCII-printable characters;
- app ID: 128 characters.

## Parent Approval UI

The parent approval surface should show:

- app display name and origin;
- chain ID;
- contract address and selector for transactions;
- message or typed-data summary for signatures;
- job index and user-readable job name for blueprint job calls.

Do not let the iframe render its own approval prompt as the only user-visible explanation.

## Kill Switches

Iframe systems need rollback that does not require app code changes:

1. Global iframe flag: disable all iframe rendering and downgrade to link-out.
2. Publisher allowlist: remove one publisher namespace.
3. Host suffix allowlist: remove a compromised host pattern.
4. Metadata update: remove or narrow the `externalApp.iframe` block.

## Header Checklist

The iframe app should ship with:

- `Content-Security-Policy` `frame-ancestors` limited to Tangle Cloud parent origins;
- `Permissions-Policy` denying unused device/payment APIs;
- `Referrer-Policy: no-referrer`;
- `X-Content-Type-Options: nosniff`;
- HSTS on production custom domains.

## Anti-Patterns

- Reading from or writing to parent storage.
- Requesting broad full-contract trust when only one selector is needed.
- Allowing all chains because the app has not modeled chain state yet.
- Using message signing with no prefix allowlist.
- Running fake streams or fake wallet state in production builds.
- Depending on local catalog entries for deployed metadata.
- Reporting a successful standalone preview as iframe verification.

## Security Review Proof

Before merge or launch, include proof for:

- one allowed request succeeds;
- one disallowed chain or selector is rejected;
- wrong-origin messages are ignored;
- iframe app cannot access parent wallet, cookies, or localStorage;
- headers are present on the deployed URL;
- global kill switch behavior is understood and documented for the environment.
