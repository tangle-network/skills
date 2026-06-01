# Iframe Manifest

The metadata block is declarative. It tells Tangle Cloud what app to load and what the iframe may request from the parent.

## Minimal Block

```json
{
  "blueprintUi": {
    "displayName": "My App",
    "publisher": { "namespace": "tangle" },
    "externalApp": {
      "url": "https://myapp.blueprint.tangle.tools/",
      "mode": "iframe",
      "label": "Open My App",
      "iframe": {
        "appId": "myapp",
        "allowedChainIds": [3799],
        "contracts": [
          {
            "chainId": 3799,
            "address": "0x0000000000000000000000000000000000000000",
            "selectors": ["0xa9059cbb"]
          }
        ],
        "messages": [],
        "allowReadAccount": true,
        "allowChainSwitch": false,
        "allowPopups": false
      }
    }
  }
}
```

## Fields

| Field | Type | Rule |
| --- | --- | --- |
| `appId` | string | Stable app identifier used in handshake and logs. |
| `allowedChainIds` | number[] | Reject signing and job requests on chains outside the list. |
| `contracts` | `{ chainId, address, selectors? }[]` | Contract allowlist. Include selectors for least privilege. |
| `messages` | `{ chainId, prefixes? }[]` | Message-signing allowlist. Prefixes should be narrow and human-readable. |
| `allowReadAccount` | boolean | Allows read-only account and chain lookup without approval. |
| `allowChainSwitch` | boolean | Allows the iframe to ask the parent to switch chains. |
| `allowPopups` | boolean | Enables popup sandbox permissions. Default false; only use for flows that need it. |

## Trust Gates

Iframe mode should render only when all gates pass:

- iframe feature flag enabled;
- metadata provenance verified;
- publisher verified;
- publisher namespace is eligible for iframe mode;
- app host is on an allowed suffix;
- URL is HTTPS;
- iframe policy parses successfully.

If any gate fails, the app should degrade to link-out mode or stay disabled.

## Local Catalog

When developing against the Tangle Cloud dapp, seed the local catalog after adding the app's local URL:

```bash
BLUEPRINT_UI_USE_LOCAL_IFRAMES=true yarn local:blueprint-ui-catalog
```

Use local iframe URLs only for local preview hosts such as `localhost` or `127.0.0.1`. Do not publish metadata that points at local hosts.

## Modes

Blueprints may expose multiple deployment modes. The parent app appends reserved URL params:

| Param | Value |
| --- | --- |
| `mode` | selected mode ID, or `default` |
| `blueprintId` | on-chain ID for the selected mode |

The parent can also post mode changes after mount. Iframe apps should listen for mode updates when the product state depends on deployment mode, but URL params must remain enough for a full reload.

## Review Questions

- Does the manifest grant only the chains, contracts, selectors, and message prefixes the app needs?
- Can the app still render read-only state without wallet access?
- Does the app clearly explain every wallet approval before requesting it?
- Is popup permission disabled unless required?
- Is the hosted URL stable and HTTPS-only?
