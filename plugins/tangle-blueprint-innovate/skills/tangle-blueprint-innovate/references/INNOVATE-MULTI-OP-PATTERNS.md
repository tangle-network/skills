# Innovate — Multi-Operator Patterns

**Multi-operator is the protocol default, not an axis.** Every Tangle
blueprint must have a coherent "what happens with 3 / 10 / 50
operators" story. If the design falls apart at 3 operators, the
design is broken — it's not a blueprint.

This doc catalogs the four design dimensions and the common patterns
in each. Use during Branch B step 4 (multi-op design) of the innovate
skill.

---

## The four dimensions

Every blueprint answers these four questions explicitly. The answers
are usually coupled — a choice in one constrains the others.

1. **Coordinator selection** — who decides an operator owns a request?
2. **State convergence** — how do operators agree on shared state?
3. **Request routing** — how does a customer request reach the right
   operator(s)?
4. **Failure model** — what happens when an operator misbehaves or
   dies?

---

## Dimension 1 — Coordinator Selection

### Pattern 1.1 — Every-op-runs-it

Every registered operator runs the same request. Used when either
(a) results must be byzantine-verifiable (quorum attestation) or
(b) work is cheap and determinism is free.

- **Use for**: oracle feeds, content moderation quorum, eval
  attestations, guardrail votes
- **Upside**: no coordinator state, byzantine-tolerant, simple
- **Downside**: N× compute cost, quorum coordination overhead
- **BSM shape**: `EVENT_DRIVEN` per-attestation; slashing on minority
  divergence

### Pattern 1.2 — Deterministic-hash coordinator

`coordinator = hash(request_id) mod N_operators`. Every op can
compute it; no vote needed. The chosen coordinator handles the
request; others standby.

- **Use for**: single-writer-per-request workloads (SQL writes,
  storage tier promotion, session-scoped state mutation)
- **Upside**: no consensus for coordinator choice; zero coordination
  overhead
- **Downside**: operator churn shifts coordinators; needs rebalance
  story
- **BSM shape**: `SUBSCRIPTION` or metered; slashing on failure to
  own a request you hashed to

### Pattern 1.3 — Elected leader

Operators run a leader-election protocol (raft, paxos, simple lease).
One leader per instance / per epoch handles all requests; others
replicate state.

- **Use for**: strong-consistency datastores, transactional systems,
  anywhere linearizability is required
- **Upside**: classic consensus guarantees
- **Downside**: leader failure = short unavailability window; complex
- **BSM shape**: `SUBSCRIPTION`; slashing on leader misbehavior or
  availability

### Pattern 1.4 — Customer picks coordinator

At service-request time, customer picks one operator as primary;
others are hot/warm standby. Manual failover or automatic on primary
death.

- **Use for**: low-throughput, high-trust workloads where the customer
  wants pinning
- **Upside**: simple, customer controls routing
- **Downside**: customer has to care; failover story needed
- **BSM shape**: `PAY_ONCE` or `SUBSCRIPTION`; slashing on primary
  unavailability beyond SLA

### Pattern 1.5 — Any op handles, first-to-commit wins

Customer submits; any op can pick it up. First to commit settlement
tx wins; others drop. Used when work is idempotent and race-to-
fastest is acceptable.

- **Use for**: lightweight lookups, cache reads, eventually-consistent
  operations
- **Upside**: best latency, no coordination
- **Downside**: wasted work on losers; idempotence requirement
- **BSM shape**: `EVENT_DRIVEN` per-settled-request; slashing on
  commit-then-rollback

---

## Dimension 2 — State Convergence

### Pattern 2.1 — No shared state

Each operator's instance is isolated. Customer picks one operator
per workspace / per request and sticks with it.

- **Use for**: customer picks the operator they trust; no cross-op
  state at all
- **Upside**: trivially consistent; no replication bugs
- **Downside**: operator failure = data unavailable until failover
- **Example**: Archetype-1 self-host (one op, no replication needed)

### Pattern 2.2 — Deterministic-idempotent writes

All ops can accept the same write; the write is idempotent and
deterministic so duplicate applies converge to the same state.
INSERT OR IGNORE, last-write-wins keyed on hash.

- **Use for**: append-only logs, event streams, monotonic counters
- **Upside**: no consensus needed; writes are free
- **Downside**: only works for specific write shapes
- **Example**: hash-keyed blob stores, dedup'd event sinks

### Pattern 2.3 — CRDT

Conflict-free replicated data type. Operators exchange deltas; each
op's state converges without central coordination.

- **Use for**: collaborative docs, shared counters, presence,
  reaction totals
- **Upside**: partition-tolerant; no leader
- **Downside**: limited data-model expressiveness
- **OSS to wrap**: Yjs, Automerge, Riak DT
- **Example**: collaborative editors, real-time state

### Pattern 2.4 — Consensus (raft, paxos)

Operators run consensus; one leader orders writes; others replicate
log. Strong consistency, clear failure semantics.

- **Use for**: transactional databases, catalog state, ledgers
- **Upside**: linearizable
- **Downside**: coordination cost, leader-failure window
- **OSS to wrap**: Hiqlite, etcd, Consul, FoundationDB, TiKV
- **Example**: distributed-sql-blueprint (hiqlite)

### Pattern 2.5 — External source of truth

State lives outside the blueprint — on-chain, in a shared storage
layer (S3, IPFS), or in a separate protocol. Ops read / write to
that layer.

- **Use for**: when state is already decentralized (chain, DA layer,
  content-addressed storage)
- **Upside**: blueprint doesn't own the hard consistency problem
- **Downside**: latency, dependency on external service
- **Example**: ops that just compute over onchain state

---

## Dimension 3 — Request Routing

### Pattern 3.1 — Customer picks operator subset at request time

Customer chooses at `onRequest` which specific operators handle their
instance (this is Tangle's default protocol flow).

- **Use for**: virtually all blueprints; it's the Tangle-native path
- **Upside**: customer sovereignty over trust set
- **Downside**: customer has to care; picker UX needed
- **BSM shape**: Tangle default — no extra config

### Pattern 3.2 — Geographic / latency routing

BPM-side routing: customer connects to nearest operator in their
subset. DNS-based or client-SDK-based.

- **Use for**: latency-sensitive workloads (inference, realtime)
- **Upside**: best latency
- **Downside**: requires operator metadata (region / latency)
- **Example**: inference blueprints where prompt latency matters

### Pattern 3.3 — Workspace→operator sticky mapping

Once a workspace / instance is created, all requests for it go to
the same operator (or ordered operator subset). Chosen at instance-
creation time.

- **Use for**: stateful workloads where operator-local caches matter
- **Upside**: cache locality; simpler state management
- **Downside**: operator failure = full migration event
- **Example**: per-user AI memory, per-tenant vector stores

### Pattern 3.4 — Every-op-sees-it (broadcast)

Request fans out to every operator in the customer's subset; each
responds. Customer aggregates.

- **Use for**: quorum / attestation patterns (Pattern 1.1)
- **Upside**: byzantine-tolerant
- **Downside**: N× cost
- **Example**: oracle queries, eval voting

### Pattern 3.5 — Coordinator-handles, others-replicate

Customer hits any op; op forwards to hash-computed coordinator (or
elected leader). Coordinator handles; replicates.

- **Use for**: classic primary-replica workloads
- **Upside**: customer doesn't need to track coordinator
- **Downside**: extra hop on first request
- **Example**: distributed-sql-blueprint writes

---

## Dimension 4 — Failure Model

### Pattern 4.1 — Crash-only

Operators may die but won't lie. Failures = unavailability, not
byzantine behavior.

- **Use for**: trusted operator sets (archetype-1 self-host; closed
  consortium PaaS)
- **Slashing**: uptime / availability SLA
- **Consensus cost**: low (raft is enough)

### Pattern 4.2 — Byzantine

At least one operator may lie, equivocate, or collude. Must tolerate
N/3 malicious.

- **Use for**: permissionless operator sets; high-value data (oracle,
  settlement, attestation)
- **Slashing**: aggressive — misattestation, equivocation,
  collusion-detected
- **Consensus cost**: high (BFT, attestation quorum)

### Pattern 4.3 — Economically rational

Operators are rational and will defect if cheaper. Slashing must
make defection costlier than honest operation.

- **Use for**: most open DePIN / production blueprints
- **Slashing**: cost-benefit calibrated (stake × slash fraction >
  expected defection gain)
- **Consensus cost**: depends on state model

### Pattern 4.4 — Reputation-weighted

Operators have a reputation score that shapes their stake / earning
rate. Bad behavior decays reputation, not just stake.

- **Use for**: long-tail operator sets where churn is common
- **Slashing**: reputation decay + stake slash on proven misbehavior
- **Consensus cost**: depends; reputation usually sits above the
  core protocol

---

## Common complete designs

Four ready-to-use design bundles that cover ~80% of blueprint shapes.
Pick one as a starting point; adjust individual dimensions as needed.

### Design A — "Archetype-1 self-host"

- Coordinator: customer picks their own operator (1.4)
- Convergence: no shared state (2.1)
- Routing: customer picks at request time (3.1)
- Failure: crash-only (4.1)
- **When**: personal tools, homelab, team internal
- **Complexity**: minimal. One op works fine; N ops is HA.

### Design B — "PaaS data plane"

- Coordinator: elected leader per instance (1.3)
- Convergence: raft or equivalent (2.4)
- Routing: coordinator-handles-others-replicate (3.5)
- Failure: crash-only or economically-rational (4.1 / 4.3)
- **When**: databases, queues, stateful infra
- **Complexity**: medium. Matches distributed-sql-blueprint.

### Design C — "Attestation / oracle / eval"

- Coordinator: every-op-runs-it (1.1)
- Convergence: attestation quorum, no shared state (2.1 / 2.5)
- Routing: broadcast (3.4)
- Failure: byzantine (4.2)
- **When**: oracles, content authenticity, eval voting, guardrails
- **Complexity**: medium. Slashing is the hard part.

### Design D — "Capacity marketplace"

- Coordinator: first-to-commit (1.5) or customer picks (1.4)
- Convergence: external source of truth (2.5)
- Routing: geographic / latency (3.2)
- Failure: economically rational + reputation (4.3 + 4.4)
- **When**: GPU markets, compute DePIN, storage markets
- **Complexity**: medium. Reputation is often underweighted early.

### Design E — "Customer-sticky stateful"

- Coordinator: workspace→operator (3.3 + 1.4)
- Convergence: local-only or CRDT (2.1 / 2.3)
- Routing: sticky (3.3)
- Failure: crash-only with migration story (4.1)
- **When**: per-user AI memory, personal vector stores, per-tenant
  sandboxes
- **Complexity**: low if single-op per instance; medium with
  replicas.

---

## Red flags to catch in Branch B step 4

If the user's proposed design has any of these, push back:

1. **"It'll work single-op and we'll figure out multi-op later."**
   → Not acceptable. Multi-op is default. Redesign now.
2. **"Every op just runs its own copy."** → Only OK if paired with
   an explicit "customer picks which op's copy they trust" story.
   Otherwise the design is ambiguous about consistency.
3. **"We'll use raft for everything."** → Overkill. Deterministic-
   idempotent writes (2.2) and external source of truth (2.5) cover
   many needs without consensus.
4. **"No slashing — operators are trusted."** → Only OK for
   archetype-1 self-host. For PaaS or direct-user, you need
   economic incentives.
5. **"Consensus over every operator change."** → Usually wrong.
   Operators can join/leave without global consensus; the blueprint
   needs a membership story that doesn't require raft.
6. **"Customer doesn't care about operators."** → Check archetype.
   Direct-to-end-user is fine to hide ops; PaaS and self-host
   should expose choice.

Every red flag must be resolved before the spec is accepted for
handoff.
