# Innovate — OSS Wrapping Patterns

The fastest innovation path for Tangle Blueprints: **take a mature
open-source library or infrastructure project, wrap it with multi-
operator coordination, BSM billing, and slashing**. The innovation is
the DePIN / multi-op / verifiability posture over well-understood
infra — not inventing new infra.

This is underused. Writing a new distributed SQL engine is hard.
Wrapping Hiqlite with Tangle's multi-operator + BSM payment + slashing
is the same product outcome, ships in days instead of months, and
inherits years of battle-testing.

---

## The wrapping pattern

```
Customer
   │
   ▼
Tangle Blueprint Instance (your thin Rust code)
   ├── Operator API (HTTP) — wraps OSS's existing API
   ├── Per-op encryption + auth — Tangle-specific
   ├── Usage metering — emits BSM events
   ├── Multi-op coordination — chosen per INNOVATE-MULTI-OP-PATTERNS
   │     │
   │     ▼
   └── Mature OSS library (Hiqlite / vLLM / Qdrant / ComfyUI / ...)
          — does the actual work
```

The blueprint code is ~1–3k LOC of Rust that:
1. Embeds or subprocesses the OSS
2. Adds Tangle-specific auth / encryption / multi-op coordination
3. Emits BSM usage events to BPM
4. Exposes the OSS's natural API through the Operator API surface

The OSS does the hard work. Tangle adds the trust / billing /
decentralization layer.

---

## Why this beats "build it from scratch"

### 1. Battle-tested correctness

Mature OSS has years of bug fixes, edge-case handling, and
performance tuning you cannot replicate in a 1-month blueprint session.

### 2. Community familiarity

Your customers already know how the OSS works. Its API, its
limitations, its quirks are public. Onboarding is near-zero.

### 3. Documentation inheritance

OSS docs are already written. Your blueprint docs cover the
incremental value (multi-op, billing, slashing) — not the core
capability.

### 4. Upgrade path

The OSS project keeps moving; you inherit improvements by bumping a
version. A from-scratch implementation requires you to also be an
infra-building company.

### 5. Faster time-to-ship

Gen 0 of a wrapping blueprint is "install OSS → expose through
Operator API → add one BSM event." That's a day of work, not a week.

### 6. Cleaner scope

The multi-op / billing / slashing layer is the blueprint's real
content. Separating it from the core capability forces honest
scoping.

---

## Canonical wrapping examples

### Already shipped (as of this doc)

| OSS | Wrapped as | Key addition |
|---|---|---|
| Hiqlite (SQLite + raft) | distributed-sql-blueprint | Multi-op consensus + per-workspace encryption + storage × time billing |
| vLLM / Ollama | inference blueprints | Multi-op GPU supply + token metering + latency SLA |
| Container sandboxes (Docker / Firecracker) | sandbox-blueprint | Multi-op provisioning + session auth + tiered GC |

### High-value wrapping candidates (not yet built)

**Data infra**
- **Qdrant / LanceDB / Weaviate** → multi-op vector store with
  customer-held keys and per-tenant encryption
- **Redpanda / NATS JetStream** → multi-op durable queue with
  regional replication and delivery attestations
- **ClickHouse / DuckDB** → multi-op analytics engine with
  query-level billing
- **FoundationDB / TiKV** → multi-op KV store with raft already built in

**AI**
- **ComfyUI / Automatic1111** → multi-op image-gen marketplace with
  queue fairness and slashing on missed SLAs
- **Whisper / Whisper.cpp + Coqui TTS** → multi-op voice pipeline
  with transcript attestation
- **SGLang / TGI** → multi-op serving with model-tier metering
- **Axolotl / TRL** → distributed fine-tune with per-epoch
  attestation and slashing

**Crypto infra**
- **Subsquid / Ponder / Envio** → multi-op indexer pool with
  freshness SLA slashing
- **RISC Zero / SP1 prover** → prover marketplace with
  submission-quorum and slashing on invalid proof

**Identity & data**
- **Veramo / Ory Hydra** → multi-op credential issuance with
  slashing on leak
- **Infisical / Vault / OpenBao** → multi-op secret vault with
  threshold access and access-log attestation

**Storage**
- **Garage / SeaweedFS / MinIO** → multi-op object storage with
  customer-held keys and retrievability proofs
- **Syncthing** → multi-op file-sync with per-path access control

**Dev infra**
- **Woodpecker CI / Buildkite agent / Drone** → multi-op runner pool
  with slashing on build pollution
- **Temporal / Inngest** → multi-op workflow engine with execution
  attestation
- **Loki / Tempo / Mimir** → multi-op observability with log
  sovereignty

**Productivity**
- **Cal.com** → multi-op scheduling with availability attestation
- **Outline / AppFlowy / Logseq** → multi-op knowledge base with
  per-tenant encryption
- **Matrix (Dendrite / Conduit)** → multi-op messaging with regional
  homeserver selection

**Gaming**
- **Nakama / Colyseus** → multi-op game backend with anti-cheat
  attestation and state rollback

**Sensor / DePIN**
- **Chirpstack / Helium OSS** → multi-op LoRaWAN network with
  payload attestation

---

## Wrapping checklist (use during Branch B step 5)

1. **Have I named a specific OSS library?** Not "something like vLLM"
   — pick one: vLLM, TGI, or SGLang. Pick one.
2. **Is the OSS mature?** Check: >1k GitHub stars, last commit
   within 3 months, open issues resolved within weeks not years,
   production users cited. If not mature, wrapping is risky.
3. **Does the OSS's license allow wrapping?** Most wrapper patterns
   are fine under MIT / Apache-2 / BSD. Check AGPL / SSPL / custom
   licenses carefully — these can contaminate your wrapper.
4. **How does the OSS handle state?** Answer dictates multi-op
   design (see `INNOVATE-MULTI-OP-PATTERNS.md`). Some OSS has
   built-in replication (Hiqlite raft, Redpanda); some is single-
   node (SQLite plain, Qdrant without clustering). The answer
   decides whether Tangle replication is additive or reinvents the
   wheel.
5. **What's the natural API surface?** HTTP? gRPC? subprocess CLI?
   FFI? The Operator API will expose a subset of this. Pick the
   subset.
6. **What's the metering unit?** Storage × time? Compute × time?
   Requests? Tokens? This maps to BSM payment type.
7. **What does "success" vs "failure" look like?** This decides
   slashing conditions. SLA misses are common; data-loss is rare
   but severe.
8. **How does the OSS handle security?** Inherit where possible;
   augment where necessary (per-tenant encryption is often additive).
9. **What breaks at 10 concurrent operators?** Network partitions,
   port collisions, state divergence — audit explicitly.
10. **What's the upgrade story?** When the OSS ships v2.0, what does
    your blueprint have to do? Smaller is better.

If answers to 1, 2, 3 are all "yes / good," wrapping is almost
certainly the right path.

---

## Anti-patterns

1. **Forking the OSS and diverging.** You become responsible for
   maintaining the fork. Wrap, don't fork. Upstream patches as PRs.
2. **Hiding the OSS from users.** Customers often picked the
   blueprint *because* the OSS is familiar. Don't rebrand it as
   "Tangle Memory" when it's Qdrant — credit the underlying project.
3. **Re-implementing one of the OSS's features "for cleanness."**
   Usually the OSS does it better. Prefer adapting.
4. **Wrapping an OSS that doesn't match your multi-op design.** If
   the OSS is fundamentally single-node and your design requires
   consensus, either (a) pick a different OSS, (b) pick a different
   multi-op pattern (deterministic-idempotent?), or (c) accept that
   multi-op replicates at a layer above the OSS.
5. **Writing the wrapper in the wrong language.** If the OSS is
   Python (ComfyUI, Whisper), the wrapper is often Rust-subprocesses-
   Python. If the OSS is C++ (vLLM internals, Qdrant), you need
   good FFI or subprocess. Don't assume pure Rust; plan the boundary.
6. **Skipping the "is the OSS mature enough?" check.** A 3-month-old
   project with 500 stars is not a safe wrap target. Wait 6 months
   or pick an alternative.
7. **Over-scoping the wrapper.** If your wrapper is >3k LOC, you're
   probably reinventing something the OSS already does.

---

## The wrapping-as-strategy insight

A Tangle blueprint marketplace filled with wrappers of mature OSS
is a stronger product than one filled with from-scratch implementations,
because:

- **Breadth over depth wins distribution**. 50 wrappers each shipping
  in a week beat 5 from-scratch blueprints each shipping in a year.
- **Wrappers inherit ecosystems**. Qdrant users can try the Tangle
  wrapper in an hour. "New Tangle Vector DB" requires learning a new
  API.
- **Competition stays honest**. Wrapping the same OSS means operators
  compete on price / latency / jurisdiction — not on API quirks.
- **Tangle's own moat is clear**. The blueprint adds multi-op +
  slashing + billing — not the core capability. Customers can see
  exactly what Tangle is adding.

When a user asks "what should I build?" the first answer should
usually be: "what mature OSS would be better with multi-op billing
and slashing on top?" The answers are numerous and concrete.

---

## Research-step integration

When running Branch A (exploration), the research sub-agents
(`INNOVATE-RESEARCH-METHOD.md`) should explicitly look for:

- **Popular OSS in the category** (GitHub Trending filtered by
  language + topic)
- **Self-hosted alternatives** (awesome-selfhosted-style lists)
- **"X but decentralized" discussion** (HN threads, arxiv papers,
  Twitter builder chatter) — these often name the OSS that's ripe
  for wrapping

The output of Branch A's research should include a short "wrap
candidates" section: 3–5 OSS libraries in the category with a
one-line "why wrap this" pitch.
