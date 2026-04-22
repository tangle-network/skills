# Innovate — The Boringness Test

The boringness test is the blocking gate before a spec is handed off
for execution. It answers one question:

**Does this blueprint do something that SaaS with more funding
couldn't trivially replicate?**

If the answer is no, the spec is boring and shouldn't ship. Iterate
until the answer is yes, or kill the idea. This is in-line taste
check, not a numeric rubric — but it has a structure that prevents
hand-waving.

---

## The four credible novelty angles

A blueprint passes the boringness test if (and only if) it's novel on
at least one of these four dimensions. "We have multi-op" by itself
is not enough — you need a reason multi-op *matters for this specific
problem.*

### Angle 1 — Trust minimization the customer can't get elsewhere

The customer cannot verify a SaaS provider's claim about a critical
property; the blueprint provides cryptographic / economic proof.

Examples:
- "Your inference actually ran on the model you requested" (signed
  output)
- "Your data never left the enclave" (TEE attestation)
- "Your oracle feed was agreed by N independent sources" (quorum
  signature)
- "This record is immutable" (log-chain signatures + slashing)

**Test**: if a customer left the blueprint and went to the equivalent
SaaS, what property would they lose that they could prove mattered?

### Angle 2 — Sovereignty / jurisdictional choice

The customer needs to run in a specific jurisdiction, with specific
legal regime, or with specific data-residency guarantees that SaaS
can't reliably offer.

Examples:
- "My EU health data never touches US infrastructure" (operator is
  EU-resident, enforced)
- "Customer-held encryption keys with rotation we control" (SaaS
  can't offer this without losing features)
- "Cross-operator attestation across three independent legal
  regimes" (for regulatory arbitrage / audit)

**Test**: is there a regulation / contract / policy that makes
centralized SaaS actually unusable for this customer?

### Angle 3 — Supply that centralized SaaS can't source

The blueprint aggregates permissionless supply that no single
provider could command.

Examples:
- "Global GPU supply from 1000+ independent operators"
- "Long-tail storage capacity from bedroom operators (Filecoin-style)"
- "Regional edge compute from micro-operators (Akash-style)"
- "Indexer capacity across every L2 without waiting for a vendor"

**Test**: could a well-funded SaaS actually match this supply
profile, or is the permissionless onboarding a structural moat?

### Angle 4 — Verifiable state the customer can audit end-to-end

Every state transition is chain-anchored, slashable, and customer-
auditable. SaaS offers "trust us"; blueprint offers "verify us."

Examples:
- "Every content-moderation decision is signed by a quorum and
  auditable forever"
- "Every training run emits a proof of which data was used"
- "Every agent action is attested and replayable"

**Test**: can a customer produce a forensic audit trail a court
would accept, without the provider's cooperation?

---

## The three-question gut check

When you read the spec, ask these out loud. If any answer is "yes,"
the test is failed and the spec needs work.

### Q1 — "Could I build this as a Vercel app in a weekend?"

If yes, you're shipping SaaS with extra tokens. Kill or pivot.

If the blueprint is "a REST API over [OSS]" with no novelty angle,
this is usually the failure mode.

### Q2 — "Would a customer pay specifically because it's on Tangle,
or despite it?"

"Specifically because" means the customer has a real reason multi-op
/ trust / sovereignty / verifiability matters for them. They'd switch
*away from* a cheaper SaaS to get it.

"Despite it" means the Tangle aspect is friction they tolerate for
some other reason (ideology, crypto-native affinity, integration
lock-in). That's not a product — that's a fanbase.

### Q3 — "If Amazon / Cloudflare / OpenAI shipped this tomorrow,
would anyone switch to us?"

If no, the idea is purely a "we got here first" play. That's not a
moat. Centralized incumbents ship infra fast; your window closes in
months.

If yes, name the specific reason. It should map to one of the four
novelty angles.

---

## Boringness patterns (common failure modes)

### Pattern B1 — "Distributed X"

"A distributed version of [popular SaaS]" with no clear reason
distribution matters for that workload. Common because "distributed"
sounds impressive. Usually fails Q1 + Q2.

**Fix**: either find a real trust / sovereignty angle, or drop the
distributed framing and just wrap the OSS for self-host.

### Pattern B2 — "Onchain X"

"Onchain version of [centralized thing]" where the onchain part is
just a log / receipt and adds no verifiability the customer actually
uses.

**Fix**: make the onchain part load-bearing for the customer —
slashing, settlement, attestation. Otherwise ship offchain.

### Pattern B3 — "Crypto-native X"

"X but designed for crypto users" where "crypto-native" means
"wallet connect and pay in tokens" — not a product reason, a
marketing wrapper.

**Fix**: identify what crypto-native users actually need that
crypto-agnostic users don't. If the answer is only payment rails,
this is a payment-gateway feature, not a blueprint.

### Pattern B4 — "Decentralized X"

"A DAO-governed / community-run / decentralized version of [SaaS]"
with no structural reason decentralization improves the product.

**Fix**: name the specific governance / trust / supply problem
decentralization solves. If it's just "no single point of failure,"
that's availability — cheaper to solve with HA than with DePIN.

### Pattern B5 — "AI X on blockchain"

"AI-powered [category] on [chain]" where the AI doesn't need the
chain and the chain doesn't need the AI.

**Fix**: pick the intersection that's load-bearing. Usually this
means verifiable inference, attested training, or slashing on bad
model behavior. "Chatbot but onchain" is not a product.

### Pattern B6 — "Platform for [ecosystem]"

"A platform that lets anyone do [vague] in [ecosystem]." Platforms
require both sides of the market; blueprints are one side.

**Fix**: pick the specific workload. "Anyone can run agents on X" is
not a workload; "run a personal memory agent with customer-held
keys" is.

---

## The iteration loop

When a spec fails the test, iterate like this:

1. **Identify the failed angle.** Which novelty dimension is weak?
2. **Ask the sharpening question for that dimension** (see the four
   angles above).
3. **If the user can't answer sharply, suggest pivoting.** Either
   change the archetype, the category, or the problem.
4. **If the pivot lands, re-run the three-question gut check.**
5. **If the gut check still fails, kill the idea and go back to
   Branch A.** Better to find a new idea than ship a boring one.

Most ideas fail on first pass. 2-3 iterations is normal. Ideas that
can't pass after 5 rounds are not blueprint-shaped — acknowledge and
move on.

---

## Passing the test — signals

A spec that has passed the boringness test usually has these traits:

1. You can explain to a non-crypto CTO in one sentence why SaaS
   doesn't work for this customer
2. The phrase "cryptographic" or "attestation" or "slashing" or
   "sovereignty" appears as load-bearing, not decorative
3. The customer persona has a specific pain that maps to a specific
   blueprint feature — not generic "better infra"
4. You can name 2-3 existing companies / products that would want
   this, ranked by urgency
5. The first-year customer count estimate is <100 but the reason is
   "high-ARR, high-touch" not "no one wants this"

---

## The kill criteria

Sometimes the right answer is to kill the idea. This is healthy —
INNOVATE exists to produce strong specs, not ship every idea.

Kill signals:
- Failed 5+ iteration rounds
- No credible novelty angle in any of 4 dimensions
- The "why not SaaS" answer keeps being about ideology, not product
- Every attempt to sharpen collapses to "but with crypto"
- The user can't name a single real customer

When killing, offer: "this doesn't pass the boringness test. Want to
try another category from `INNOVATE-CATEGORIES.md`, pivot to a
different archetype, or look at the intersections table?"

Don't let politeness ship bad specs. A killed-and-replaced idea
takes 30 minutes; a built-and-failed one takes 6 months.
