# Innovate — Category Taxonomy

28 categories for Tangle Blueprint ideas. Grouped but independent —
a blueprint can sit in one or straddle an intersection (intersections
are usually the best ideas). Each category lists: **typical unsolved
problems**, **example mature OSS that could be wrapped**, **canonical
multi-op angle** (why the blueprint shape beats SaaS), and **likely
BSM payment type**.

Idea-space math: 28 categories × 3 archetypes × ~12 BSM primitives ×
~8 problem framings = ~8,000 distinct spec shapes before
intersections. Well past 1M total.

---

## Crypto-native (6)

### 1. Crypto Infra

Rollups, co-processors, DA, bridges, indexers, RPC, light clients, MEV
supply, intent solvers.

- **Problems**: reliable RPC without centralization, indexers that
  don't fall over at chain tip, co-processor availability, DA
  redundancy, bridge trust minimization.
- **OSS to wrap**: Subsquid, Ponder, The Graph node, Reth/Erigon
  light client, Envio, Indexed, Base indexers.
- **Multi-op angle**: operator-set redundancy for availability;
  slashing for bad quotes / stale data.
- **Payment**: `SUBSCRIPTION` for RPC endpoints; `EVENT_DRIVEN`
  per-query for indexers.

### 2. Crypto Protocol

Restaking, LSTs, DePIN substrate, governance, coordination, oracles,
identity, attestations.

- **Problems**: operator coordination for consensus protocols,
  restaking AVS execution, oracle feed aggregation with slashing.
- **OSS to wrap**: Othentic, EigenLayer AVS patterns, Chainlink CCIP
  node software, Pyth lazer, SSV network.
- **Multi-op angle**: protocol requires ≥N operators by design;
  slashing is the whole point.
- **Payment**: `EVENT_DRIVEN` per-attestation; `SUBSCRIPTION` for
  feed consumers.

### 3. Trading / DeFi

DEXes, aggregators, MEV protection, perps, order books, RFQ, lending,
stables, structured products, yield vaults.

- **Problems**: RFQ market making with signed quotes, MEV-protected
  order routing, private order flow, strategy execution for vaults,
  credit scoring for undercollateralized lending.
- **OSS to wrap**: Hyperliquid-style order book engines, 0x / CoW
  Protocol matchers, Nomial / Paradex relay logic.
- **Multi-op angle**: market makers as operators with slashing for
  quote failure; credit attestations from multiple sources.
- **Payment**: `EVENT_DRIVEN` per-fill; `SUBSCRIPTION` for feed
  access.

### 4. Privacy / ZK

Mixers, ZK apps, shielded payments, private identity, anonymous
credentials, private compute, private voting.

- **Problems**: ZK prover availability (provers are expensive,
  supply-constrained), private credential verification, shielded
  payment rails, private analytics.
- **OSS to wrap**: RISC Zero, SP1, Halo2 prover pools, Aleo snarkOS,
  Semaphore, Railgun backend.
- **Multi-op angle**: prover markets with slashing on failed proofs;
  multi-op privacy set for k-anonymity.
- **Payment**: `EVENT_DRIVEN` per-proof; `SUBSCRIPTION` for private
  analytics.

### 5. Storage / Archival

Durable storage, permanent records, decentralized CDN, content
addressing, cold-storage archive.

- **Problems**: affordable long-term archival with retrievability
  proofs, CDN with multi-region sovereignty, customer-held key
  storage.
- **OSS to wrap**: Garage (S3-compat), SeaweedFS, IPFS cluster,
  Piraeus/Longhorn, Filecoin Lotus.
- **Multi-op angle**: each operator stores a shard; PoR / PoS
  challenges for retrievability; slashing on failed challenge.
- **Payment**: `SUBSCRIPTION` per stored × time; `EVENT_DRIVEN`
  per-retrieval for CDN.

### 6. Content Authenticity

Deepfake detection, C2PA-style provenance, watermarking, moderation
signatures, origin proofs.

- **Problems**: cross-platform provenance that doesn't rely on a
  single company, model-agnostic watermark detection, moderation
  without a central authority.
- **OSS to wrap**: Truepic C2PA libs, SynthID-open, Project Origin
  signing, Mediabench.
- **Multi-op angle**: attestation quorum from N independent detectors;
  slashing on false attestation.
- **Payment**: `EVENT_DRIVEN` per-check; `SUBSCRIPTION` for stream
  monitoring.

---

## AI (6)

### 7. AI Agents

Tool-use, memory, orchestration, browser/computer use, multi-agent,
workflow engines, long-running tasks.

- **Problems**: persistent agent memory with durability, verifiable
  tool-use traces, agent orchestration with failover, secure
  computer-use sandboxes.
- **OSS to wrap**: LangGraph, Mastra, Letta memory, Browserbase /
  Playwright pool, Open Interpreter, Semantic Kernel.
- **Multi-op angle**: memory replication for agent state; sandbox
  pool with redundancy; slashing on task-failure.
- **Payment**: metered (tool-calls × compute × time); `SUBSCRIPTION`
  for always-on agents.

### 8. AI Inference / Serving

Serving, routing, caching, batching, speculative decoding, multi-model,
edge inference, embedding generation.

- **Problems**: competitive inference pricing without centralized
  providers, model-specific hot paths, KV cache warmth, fallback
  routing on load.
- **OSS to wrap**: vLLM, TGI, SGLang, Ollama, TabbyML, LMDeploy,
  llama.cpp server.
- **Multi-op angle**: GPU operators compete; latency / uptime-based
  slashing; customer-selects-op for jurisdiction.
- **Payment**: metered per-token × model-tier; `EVENT_DRIVEN`
  per-request.

### 9. AI Training / Evals

RL, GRPO, DPO, fine-tune, distillation, eval-as-a-service, synthetic
data generation, dataset markets.

- **Problems**: verifiable training runs, eval reproducibility,
  distributed fine-tuning coordination, preference data collection.
- **OSS to wrap**: Axolotl, TRL, Unsloth, LLM Foundry, Promptfoo,
  Inspect AI, DeepEval.
- **Multi-op angle**: eval operators attest to run results with
  slashing on cherry-picking; training operators compete on cost/hr.
- **Payment**: `EVENT_DRIVEN` per-run; `SUBSCRIPTION` for eval feeds.

### 10. AI Security / Trust

Guardrails, prompt-injection defense, sandboxing, red-teaming,
attribution, watermarking, jailbreak detection.

- **Problems**: independent guardrail attestation, red-team-as-a-
  service, agent-action auditing, prompt-injection detection at
  scale.
- **OSS to wrap**: NeMo Guardrails, LLM Guard, PyRIT, garak,
  Lakera Gandalf-style datasets.
- **Multi-op angle**: multiple independent guardrail operators vote;
  slashing on missed jailbreak.
- **Payment**: `EVENT_DRIVEN` per-check; `SUBSCRIPTION` for
  continuous monitoring.

### 11. AI Data / Memory

RAG, embeddings, vector stores, graph RAG, extraction, personal
memory, structured-data extraction.

- **Problems**: personal-memory sovereignty (customer-held keys),
  graph-RAG at scale, embedding consistency across providers,
  structured-extraction correctness.
- **OSS to wrap**: Qdrant, LanceDB, Weaviate, Milvus, Nebula Graph,
  Kùzu, Unstructured.io.
- **Multi-op angle**: per-user vector stores with customer-held
  encryption; operator-agnostic embedding attestations.
- **Payment**: `SUBSCRIPTION` per stored × time; metered on queries.

### 12. AI Multimodal

Voice (STT/TTS), video, image gen, realtime, music, 3D.

- **Problems**: affordable realtime voice, video-gen queue fairness,
  image-gen availability at peak, long-context video editing.
- **OSS to wrap**: ComfyUI, Automatic1111, Whisper / whisper.cpp,
  Coqui TTS, Piper, StreamingT2V, AnimateDiff.
- **Multi-op angle**: GPU operators compete; queue fairness + SLA
  slashing; regional jurisdictional choice.
- **Payment**: metered per-second / per-output; `EVENT_DRIVEN`
  per-generation.

---

## Dev Infra (3)

### 13. Observability / Tracing

Logs, traces, metrics, eval replay, cost tracking, error monitoring.

- **Problems**: self-hosted observability without the pain, multi-
  jurisdictional log sovereignty, agent-trace replay, cost
  attribution across providers.
- **OSS to wrap**: Loki, Tempo, Mimir, ClickHouse, OpenTelemetry
  collector, Langfuse, Helicone.
- **Multi-op angle**: log sovereignty by region; replication with
  slashing on loss.
- **Payment**: `SUBSCRIPTION` per GB × retention; metered on query.

### 14. Build / Deploy

CI/CD, preview envs, secrets, feature flags, artifact registries.

- **Problems**: self-hosted runner pools, secret provisioning with
  slashing, preview-env isolation, artifact-registry bandwidth.
- **OSS to wrap**: Woodpecker CI, Buildkite agent, Drone, act,
  OpenFaaS, Dagger, Harness OSS.
- **Multi-op angle**: runner fleet with slashing on build-pollution;
  customer-picks-region.
- **Payment**: metered per minute × runner-tier.

### 15. Data Infra

Databases, queues, caching, streams, edge state.

- **Problems**: multi-op durable SQL/KV with encryption at rest,
  regional queue mirroring, edge-state consistency.
- **OSS to wrap**: Hiqlite, PostgreSQL + Patroni, Redpanda, NATS
  JetStream, RedisJSON, Dragonfly, FoundationDB, Turso libSQL.
- **Multi-op angle**: consensus-based replication across operators;
  slashing on data loss; customer-held encryption keys.
- **Payment**: `SUBSCRIPTION` per stored × time + metered on IOPS.

---

## Identity & Trust (2)

### 16. Identity / Credentials

DIDs, VCs, OAuth for agents, key vaults, delegated access,
passkeys-as-a-service.

- **Problems**: agent credential vault with scoped delegation, DID
  resolution with slashing on misattribution, passkey-as-a-service
  without lock-in.
- **OSS to wrap**: Veramo, Ory Hydra/Kratos, Keycloak, OpenZiti,
  Infisical (secrets), Vault.
- **Multi-op angle**: credential-holding operators with slashing on
  leak; DID resolver quorum.
- **Payment**: `SUBSCRIPTION` per credential × time; `EVENT_DRIVEN`
  per-auth.

### 17. Reputation / Attribution

Scoring, vouching, citation tracking, sybil resistance, review
integrity.

- **Problems**: sybil-resistant scoring, citation tracking across
  platforms, review-integrity attestation, work-attribution trails.
- **OSS to wrap**: Gitcoin Passport, Karma3 / EigenTrust, Humanode,
  Worldcoin OSS components.
- **Multi-op angle**: multiple independent scorers; slashing on
  collusion; customer picks scoring subset.
- **Payment**: `EVENT_DRIVEN` per-check; `SUBSCRIPTION` per feed.

---

## Real-World / DePIN (4)

### 18. Compute DePIN

GPU/CPU marketplaces, bare metal, edge compute, sovereign cloud.

- **Problems**: verifiable GPU supply, capacity commitment enforcement,
  region-specific sovereignty, GPU utilization telemetry.
- **OSS to wrap**: Nomad, Slurm, Kueue, NVIDIA DCGM, RunPod-open,
  SaladCloud agent.
- **Multi-op angle**: GPU operators with capacity-hour slashing;
  customer-selects by region/latency.
- **Payment**: metered GPU × time; `SUBSCRIPTION` for reserved
  capacity.

### 19. Sensor / IoT

Location proofs, environmental monitoring, supply-chain telemetry,
health-sensor aggregation.

- **Problems**: verifiable location proofs (anti-spoofing),
  environmental data with chain-of-custody, sensor aggregation for
  insurance / compliance.
- **OSS to wrap**: Helium OSS components, Chirpstack, Node-RED,
  Dimo SDK.
- **Multi-op angle**: sensor operators attest to readings with
  slashing on spoof detection.
- **Payment**: `EVENT_DRIVEN` per-reading; `SUBSCRIPTION` per
  sensor × time.

### 20. Energy / Climate

Energy trading, carbon markets, grid coordination, environmental
reporting.

- **Problems**: carbon-credit verifiability, distributed-energy
  coordination, grid-edge device orchestration, emissions attestation.
- **OSS to wrap**: OpenRemote, HomeAssistant + Enphase, EnergyPlus,
  Toucan Protocol OSS.
- **Multi-op angle**: attestation operators; slashing on false carbon
  claims.
- **Payment**: `EVENT_DRIVEN` per-credit-issuance; `SUBSCRIPTION`
  per monitored device.

### 21. Logistics / Supply

Proof-of-delivery, inventory sync, shipment tracking, carbon tracking.

- **Problems**: multi-party inventory sync without a dominant
  platform, proof-of-delivery with chain-of-custody, freight-tender
  RFQ.
- **OSS to wrap**: Odoo inventory, Frappe ERPNext, OpenSupplyHub.
- **Multi-op angle**: multi-party attestations across a supply chain;
  slashing on false delivery claim.
- **Payment**: `EVENT_DRIVEN` per shipment; `SUBSCRIPTION` per SKU
  tracked.

---

## Vertical / Domain (7)

### 22. Health / Bio

Health data vaults, clinical trials, consent management, protein /
drug discovery compute, bioinformatics pipelines.

- **Problems**: HIPAA-compliant data sovereignty, clinical-trial
  attestation, consent revocation, reproducible bioinformatics.
- **OSS to wrap**: OpenMRS, FHIR server (HAPI), AlphaFold OSS,
  Nextflow, Snakemake, Cromwell.
- **Multi-op angle**: regional sovereignty for health data;
  customer-held keys; slashing on leak.
- **Payment**: `SUBSCRIPTION` per record × time; `EVENT_DRIVEN`
  per-compute-run.

### 23. Legal / Compliance

Contract analysis, policy engines, KYC/AML, audit trails, regulatory
reporting.

- **Problems**: audit trails that survive vendor churn, policy-engine
  sovereignty, KYC without central custody, cross-jurisdiction
  compliance reporting.
- **OSS to wrap**: OpenPolicyAgent, DocAssemble, Kopi Contract
  Analyzer, Casbin.
- **Multi-op angle**: attestation operators across jurisdictions;
  slashing on misclassification.
- **Payment**: `EVENT_DRIVEN` per-check; `SUBSCRIPTION` per
  monitored contract.

### 24. Finance (non-crypto)

Banking APIs, fraud detection, underwriting, reconciliation,
open-banking aggregators.

- **Problems**: reconciliation across many banks, fraud-score
  providers without single-vendor lock-in, underwriting data
  aggregation.
- **OSS to wrap**: Plaid-alternative OSS (Teller, Nordigen),
  Paragon OSS, OpenAML.
- **Multi-op angle**: multi-source aggregation with attestation;
  slashing on stale data.
- **Payment**: metered per-call; `SUBSCRIPTION` per account × time.

### 25. Education / Learning

Credentials, adaptive learning, tutoring, skill verification, course
platforms.

- **Problems**: portable credentials, skill attestation quorum,
  adaptive-learning sovereignty, tutor agent availability.
- **OSS to wrap**: Open edX, Moodle, Totara, Badgr.
- **Multi-op angle**: skill-assessment operators (multi-source
  attestation); slashing on false pass.
- **Payment**: `EVENT_DRIVEN` per-credential-issuance; `SUBSCRIPTION`
  per learner × time.

### 26. Gaming / Virtual

Game backends, skill-based gaming, asset markets, metaverse state,
anti-cheat.

- **Problems**: anti-cheat attestation, tournament fairness, asset
  ownership across games, state rollback.
- **OSS to wrap**: Nakama, Colyseus, HeroicLabs, Godot netcode,
  PlayFab-alternatives.
- **Multi-op angle**: anti-cheat operator quorum; slashing on
  false ban.
- **Payment**: `SUBSCRIPTION` per player × time; metered per-match.

### 27. Creator / Social

Monetization, audience graphs, recommendation, attribution,
creator-owned platforms.

- **Problems**: creator-owned audience graphs, cross-platform
  attribution, recommendation without centralized feed algo.
- **OSS to wrap**: Mastodon, Bluesky AT Proto, Lemmy, Funkwhale,
  PeerTube, Jellyfin.
- **Multi-op angle**: feed-algo operators (user picks which);
  slashing on engagement manipulation.
- **Payment**: `SUBSCRIPTION` per follower × time; `EVENT_DRIVEN`
  per-post-delivery.

### 28. Productivity / Work

Meeting intelligence, scheduling, document automation, CRM glue,
knowledge bases.

- **Problems**: meeting-notes sovereignty, knowledge-base federation,
  scheduling-quorum for groups, CRM-glue without platform lock-in.
- **OSS to wrap**: Outline, AppFlowy, Cal.com, BookStack, SuiteCRM,
  EspoCRM, Logseq.
- **Multi-op angle**: per-tenant sovereignty with operator choice;
  slashing on data loss.
- **Payment**: `SUBSCRIPTION` per seat × time.

---

## Intersections (usually the best ideas)

The richest vein is the intersection between two categories. Examples
with concrete idea-shapes:

| A | B | Example idea |
|---|---|---|
| Crypto Infra | AI Inference | Onchain-verifiable LLM inference with ZK proof |
| AI Agents | Identity / Credentials | Agent credential vault with per-tool scoped delegation |
| AI Inference | Privacy / ZK | Shielded inference — prompt + response never leave encrypted enclave |
| Data Infra | AI Data / Memory | Multi-op vector store with customer-held keys |
| Compute DePIN | AI Training | GPU-training marketplace with per-epoch slashing |
| Sensor / IoT | Content Authenticity | Provable-location photo provenance for journalism / insurance |
| Trading / DeFi | AI Agents | Agent-callable DEX aggregator with risk attestation |
| Health / Bio | Privacy / ZK | ZK-attested medical-record queries without plaintext exposure |
| Creator / Social | Reputation | Creator-owned audience graph with cross-platform reputation |
| Legal / Compliance | AI Agents | Agent-executed compliance checks with attestation trail |

The pattern: one category provides the **problem / domain**, the other
provides the **trust / verifiability angle** that makes the blueprint
shape beat SaaS.

## How to use this catalog

1. User picks 1-3 categories or names an intersection.
2. Dispatch research sub-agents scoped to those categories (see
   `INNOVATE-RESEARCH-METHOD.md`).
3. Return top 5 blueprint-shaped opportunities from the research.
4. Pick one → proceed to `SKILL.md` Branch B (specification).

Categories are not exhaustive or exclusive. A strong idea can straddle
3 or live in a new intersection not listed. The purpose is to scope
research, not to box in imagination.
