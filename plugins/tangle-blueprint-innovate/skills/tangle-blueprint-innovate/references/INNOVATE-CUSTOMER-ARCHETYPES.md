# Innovate — Customer Archetypes

Three archetypes. They fork the blueprint's auth, billing, UX, and
multi-tenant story. Most blueprints serve 1–2 archetypes. Naming the
primary archetype early prevents the "built like X, marketed like Y"
drift that accounts for most mid-session scope blowups.

---

## Archetype 1 — Self-Hosting Operator (customer = operator)

The customer runs their own instance. They are the operator. One-and-
the-same legal / economic entity. Often a small team or solo
practitioner who just wants the capability running somewhere they
control.

### Auth story
- Local-network trust or IP-allowlist by default
- Dev-mode JWT with HS256 is acceptable (user holds both keys)
- No multi-tenant isolation needed
- Session auth optional for CLI; required for web UI

### Billing story
- Usually free-to-self (operator keeps 100% of their own fees)
- Or flat per-month "run-my-own" fee if blueprint author charges
- BSM `PAY_ONCE` at service-request time is the common payment type
- No ongoing metered billing from instance back to chain

### UX story
- CLI-first or admin-UI-only
- No need for polished end-user UX
- `from_env()` builder + single YAML config is enough
- Docs focus on "how do I run this locally"

### Multi-op posture
- Customer may run 1 operator (self), 3 (HA within their own infra),
  or rarely more
- The protocol still allows other operators to register, but the
  customer won't select them — they only pick their own operator
  addresses at service-request time
- Consensus / replication code matters only if customer runs >1 op

### When this archetype fits
- Personal tools (self-hosted RAG, personal memory, homelab infra)
- Small-team internal tools (team vector store, team dashboard)
- Sovereign deployments (org runs their own, refuses SaaS)
- Developer playground usage

### BSM hook emphasis
- `onRegister` (operator self-registers)
- `onRequest` (customer self-approves)
- `PAY_ONCE` payment at request
- Lifecycle hooks (`onTerminate`, `onUpdate`) for admin ops
- Slashing: usually disabled (no adversarial parties)

### Anti-patterns for this archetype
- Building complex tenant isolation (you're your own tenant)
- Shipping polished end-user UI (CLI is fine)
- Per-request metered billing (overkill for self-use)
- Over-engineering auth (HS256 dev-mode is OK here)

---

## Archetype 2 — PaaS-for-Dev (customer = app builder)

The customer is a developer / team building an application that serves
their own end-users. The blueprint is infrastructure they compose into
their product. Classic SaaS-infra positioning, but with multi-op
sovereignty.

### Auth story
- Customer-scoped API keys (one key per customer tenant)
- Customer manages their own end-user auth separately
- RS256 or ES256 JWT for customer-authenticated calls
- Optional: delegated tokens for end-user → instance direct calls
- Multi-tenant isolation is the default

### Billing story
- Customer pays by metered usage (storage × time, compute × time,
  per-call, etc.)
- Customer absorbs cost and marks up to their end-users
- BSM `SUBSCRIPTION` + metered overage is the common shape
- Prepaid escrow common (customer funds account, debited over time)
- Usage dashboards required

### UX story
- SDK-first (Rust + TypeScript + Python client libs)
- Dashboard for usage / limits / billing
- API documentation is the main UX
- Onboarding: "here's your API key, here's curl"

### Multi-op posture
- Customer selects N operators at service-request time for
  redundancy, latency, or jurisdictional reasons
- Typical: 3–10 operators per customer instance
- Operators compete on uptime / latency / price
- Customer picks multi-region by default for production

### When this archetype fits
- Developer-facing infrastructure (databases, queues, inference,
  storage)
- Agent-infrastructure building blocks (memory, tool-use,
  orchestration)
- Anything where the customer's product has end-users the blueprint
  author never meets

### BSM hook emphasis
- `onRegister` (operator supply)
- `onRequest` (customer provisions per-project instances)
- `SUBSCRIPTION` + metered events for usage
- `reportUsage` hook emitted from instance
- Lifecycle hooks for pause / resume on escrow depletion
- Slashing enabled for SLA breaches (uptime, latency, data-loss)

### Anti-patterns for this archetype
- Per-seat billing (developers don't think in seats)
- Long onboarding flows (developers leave if curl doesn't work in 5m)
- Assuming end-user identity in blueprint (that's the customer's job)
- Hiding multi-op from the customer (let them pick operator subset)

---

## Archetype 3 — Direct-to-End-User (customer = consumer)

The customer is the end-user of a polished product. They might not know
the product is a blueprint. They care about the capability and the UX,
not the infrastructure.

### Auth story
- Full user auth (OAuth, web3 wallet, email+pass, passkeys)
- Single-tenant from user's perspective (their own account)
- Sometimes family / team sharing modes
- RS256 / ES256 JWT with refresh flow
- Session management with secure cookies for web

### Billing story
- Per-seat subscription or per-use billing (familiar consumer shapes)
- Often prepaid credits or all-you-can-eat tiers
- Customer doesn't interact with BSM directly — the operator/author
  abstracts it
- Stripe-style billing at the product layer, settled to chain
  downstream
- Free-tier common

### UX story
- Polished web UI / mobile app
- Zero-config onboarding (sign up → use)
- Product-led growth expected
- Operators are invisible to the user
- Support + customer success required

### Multi-op posture
- Single operator per user is fine (the operator IS the product
  company in practice)
- Or: operators are jurisdictional (EU / US / APAC routes user to
  regional operator)
- Multi-op redundancy is an implementation detail the user doesn't
  see
- Operator churn handled by the product company, not the user

### When this archetype fits
- Consumer AI apps (chat, image gen, voice, avatars)
- Personal productivity tools
- Gaming / entertainment
- Financial products for non-crypto-natives

### BSM hook emphasis
- Often there's one "meta-operator" (the product company) that
  runs on behalf of all users
- `SUBSCRIPTION` at the operator level, not per-user-per-instance
- Usage aggregated across users, reported in aggregate
- Slashing is an internal product-company concern, not user-facing

### Anti-patterns for this archetype
- Exposing operator selection to end-users (they don't care)
- Forcing wallet connection if email works (wallet is optional)
- Per-instance billing UX (users think in subscriptions)
- Showing blueprint_id / service_id in user UI (implementation leak)

---

## Hybrid archetypes (common, handle explicitly)

Most successful blueprints serve two archetypes simultaneously:

### Self-host + PaaS-for-dev
- One codebase, two deployment modes
- Self-host: developer runs locally, no multi-op concerns, HS256 OK
- PaaS: hosted multi-op with SDK, RS256, metered billing
- Fork on build-time feature flags or runtime mode env var
- Example: most OSS-wrapping blueprints (the OSS already has this
  duality — the blueprint just preserves it)

### PaaS-for-dev + Direct-to-end-user
- PaaS is the core product; a thin polished web app sits on top
- The web app is itself a "customer" of the PaaS
- Example: Tangle-hosted infra that also offers a Vercel-like UI for
  dev onboarding

### All three
- Rare but powerful
- Requires clear auth boundary: local dev → API key → end-user session
- Example: sufficiently mature category leaders (Supabase shape)

---

## Archetype-lock triggers (use in Branch B)

Force archetype clarity at step 3 of Branch B by asking (in this
order, stop at first clear answer):

1. "Who is the buyer?" — if "me" → self-host; if "a developer" →
   PaaS; if "a consumer" → direct-to-end-user
2. "Who handles auth for end-users?" — if "me" → self-host; if "my
   customer" → PaaS; if "the blueprint" → direct-to-end-user
3. "Who pays the operator?" — if "me out of my own escrow" →
   self-host; if "my customer bills their users and pays me" →
   PaaS; if "the user directly via card / wallet" → direct-to-end-
   user
4. "What's on the first screen the user sees?" — a CLI → self-host;
   an API key + curl → PaaS; a signup form → direct-to-end-user

If the user can't answer, suggest they pick the most restrictive
archetype for the initial build and expand later. Self-host → PaaS →
direct-to-end-user is the usual maturation order.

---

## Archetype × category heat-map

A rough guide to which archetypes suit which categories (from
`INNOVATE-CATEGORIES.md`):

| Category | Self-host | PaaS | Direct-user |
|---|---|---|---|
| Crypto Infra | ⭐ | ⭐⭐⭐ | ⭐ |
| Crypto Protocol | ⭐ | ⭐⭐⭐ | ⭐ |
| Trading / DeFi | ⭐ | ⭐⭐ | ⭐⭐⭐ |
| Privacy / ZK | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| Storage / Archival | ⭐⭐⭐ | ⭐⭐⭐ | ⭐ |
| Content Authenticity | ⭐ | ⭐⭐⭐ | ⭐⭐ |
| AI Agents | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| AI Inference / Serving | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| AI Training / Evals | ⭐⭐ | ⭐⭐⭐ | ⭐ |
| AI Security / Trust | ⭐ | ⭐⭐⭐ | ⭐ |
| AI Data / Memory | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| AI Multimodal | ⭐ | ⭐⭐ | ⭐⭐⭐ |
| Observability / Tracing | ⭐⭐⭐ | ⭐⭐⭐ | ⭐ |
| Build / Deploy | ⭐⭐⭐ | ⭐⭐⭐ | ⭐ |
| Data Infra | ⭐⭐⭐ | ⭐⭐⭐ | ⭐ |
| Identity / Credentials | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| Reputation / Attribution | ⭐ | ⭐⭐⭐ | ⭐⭐ |
| Compute DePIN | ⭐ | ⭐⭐⭐ | ⭐ |
| Sensor / IoT | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| Energy / Climate | ⭐ | ⭐⭐ | ⭐⭐ |
| Logistics / Supply | ⭐ | ⭐⭐⭐ | ⭐⭐ |
| Health / Bio | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| Legal / Compliance | ⭐ | ⭐⭐⭐ | ⭐⭐ |
| Finance (non-crypto) | ⭐ | ⭐⭐⭐ | ⭐⭐ |
| Education / Learning | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Gaming / Virtual | ⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Creator / Social | ⭐ | ⭐⭐ | ⭐⭐⭐ |
| Productivity / Work | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |

Not hard rules — if your idea has a good reason to cross into a
low-star cell, do it. But if you're in a 1-star cell, make sure you
can explain why.
