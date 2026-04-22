# Innovate — Research Method

The research step in Branch A (exploration) dispatches sub-agents
across 5 sources in parallel to find real unmet problems in a
category. This doc has the fanout prompts and synthesis pattern.

Run research **after** the user has picked category(ies) + archetype.
Don't research before scoping — results will be noise.

---

## The 5 sources

Each source captures a different signal:

| Source | Signal | What it tells you |
|---|---|---|
| GitHub Trending | "people are building" | What devs are actively shipping + starring |
| Hacker News | "people are talking" | What's getting technical attention + critique |
| Product Hunt | "people are launching" | What's getting consumer-side traction |
| arxiv | "people are publishing" | What's rigorously new in research |
| Twitter / X | "people are announcing" | What builders are saying right now |

Rule: **dispatch all 5 in parallel.** Each sub-agent returns in
<2 minutes; synthesis is <1 minute. Total research time ~3 minutes.

If the `last30days` skill is available in the environment, prefer it
for temporal scoping — it has better recency heuristics than hand-
rolled date filters.

---

## Fanout prompt templates

Dispatch each as a separate research sub-agent. All 5 can run
concurrently.

### GitHub Trending sub-agent

```
Research sub-agent task: GitHub Trending scan for Tangle Blueprint
idea generation.

Category focus: <category or intersection — e.g. "AI Agents" or
"Crypto Infra × AI Inference">.

Your job:
  1. Identify the top 10 GitHub projects trending or recently active
     in this category (push activity within last 60 days, >500 stars
     or >50 commits).
  2. For each: 1-line summary, what problem it solves, what's the
     current scaling / trust / ops pain the README or issues
     surface.
  3. Flag any project that looks ripe for wrapping as a Tangle
     blueprint (mature, popular, has a multi-op / trust / sovereignty
     pain point).

Output shape: markdown table with columns [Project, Stars, Active?,
Problem, Pain points, Wrap candidate?]. ≤400 words total.

Skip: forks, templates, hello-worlds, abandoned projects.
```

### Hacker News sub-agent

```
Research sub-agent task: HN scan for Tangle Blueprint idea generation.

Category focus: <category or intersection>.

Your job:
  1. Find the top 10 HN stories in the last 90 days about this
     category (Show HN, Ask HN, front page). Focus on stories with
     >200 points or >100 comments — that's the real signal.
  2. For each: 1-line summary, the actual pain the submitter
     describes, and what the top comment thread argues is broken or
     missing.
  3. Flag recurring themes — what do 3+ independent HN posts say
     is missing in this category?

Output shape: markdown sections with HN link, pain quote, what's
missing. ≤400 words total.

Note: HN comments are often more valuable than the submitted post
itself. Quote specific comments that name a real gap.
```

### Product Hunt sub-agent

```
Research sub-agent task: Product Hunt scan for Tangle Blueprint idea
generation.

Category focus: <category or intersection>.

Your job:
  1. Find the top 10 Product Hunt launches in the last 90 days in
     this category (sort by upvotes).
  2. For each: 1-line summary, the target customer, pricing model
     (critical — this tells you what the market will pay for).
  3. Identify the gap: what are these consumer-SaaS launches missing
     that a multi-operator, trust-minimized blueprint could deliver?

Output shape: markdown with launch, price, gap. ≤300 words total.

Note: Product Hunt is heavy on Archetype-3 (direct-to-end-user).
If your archetype is PaaS, weight the findings accordingly.
```

### arxiv sub-agent

```
Research sub-agent task: arxiv scan for Tangle Blueprint idea
generation.

Category focus: <category or intersection>.
Relevant arxiv categories: cs.AI, cs.CR, cs.DC, cs.DB, cs.LG, cs.DS.

Your job:
  1. Find the top 10 papers in the last 90 days in this area,
     sorted by recency + citation velocity.
  2. For each: 1-line summary, what's novel, whether the idea
     could become a blueprint (is there a capability here that
     would benefit from multi-op execution + slashing + economic
     incentives?).
  3. Flag papers with open-source code releases — those are
     fastest to wrap.

Output shape: markdown with arxiv ID, one-line novelty, blueprint
fit. ≤400 words total.

Note: most arxiv papers are not directly useful. The 1-in-10 that's
a new primitive with an OSS release is the valuable signal.
```

### Twitter / X sub-agent

```
Research sub-agent task: Twitter builder-chatter scan for Tangle
Blueprint idea generation.

Category focus: <category or intersection>.

Your job:
  1. Search for category keywords in builder-focused accounts (@VCs,
     @founders, @indie-hackers, @crypto-builders, @AI-researchers).
  2. Identify 5-10 threads in the last 30 days that name a specific
     unmet need — "why doesn't X exist" / "we need Y" / "building Z
     because no one else will."
  3. Quote the specific ask. Name the account if relevant context.

Output shape: markdown with quote, author, link. ≤300 words total.

Note: Twitter-without-API means you're doing web search + X.com
search operators. Be explicit about search queries used. This source
is lower-precision than others — use it for inspiration, not ground
truth.
```

---

## Synthesis pattern

After all 5 sub-agents return, the main skill synthesizes their
outputs into a short actionable report.

### Synthesis template

```markdown
# Research — <category or intersection>
# Archetype — <picked archetype(s)>

## Top 5 blueprint-shaped opportunities

1. **<One-line problem statement>**
   - Evidence: <source 1> + <source 2>
   - Why it's blueprint-shaped: <multi-op / trust / sovereignty
     reason>
   - Suggested wrap candidate: <OSS library or "build from scratch">

(repeat for 5)

## Top 3 gaps (hype vs reality)

Things that get discussed a lot but don't have real solutions yet:

1. <gap>. Cited by <source>, <source>. No credible solution because
   <reason>.

## Cross-category intersections worth exploring

1. **<cat A> × <cat B>**: <idea shape>
2. (up to 3)

## Wrap candidates surfaced

List every OSS library the sub-agents flagged as "mature, popular,
multi-op pain point exists." Sort by maturity.

| OSS | Stars | Last commit | Category | Wrap angle |
|---|---|---|---|---|
| ... | ... | ... | ... | ... |

## Recommended next step

Pick one of the top 5 opportunities → proceed to Branch B
(specification) with that idea. Or pick an intersection if something
in that section lit up.
```

The report must fit on one screen (≤600 words). If it overflows,
trim — the user needs signal, not a compendium.

---

## What to do if a source returns nothing

Any given category may not have strong signal in every source:

- **arxiv silent**: totally fine for many categories (e.g.
  Productivity / Work rarely has strong arxiv presence)
- **Product Hunt silent**: fine for infrastructure categories (devs
  don't launch infra on PH)
- **Twitter silent**: common for enterprise / vertical categories

Silence in 1-2 sources is normal. Silence in 4+ means the category
is wrong (too broad, too niche, or too new). Reshape the category
and rerun.

---

## Anti-patterns

1. **Dispatching research before scoping.** Without category + archetype,
   results are noise.
2. **Running sources sequentially.** Parallel is 5× faster with no
   quality cost.
3. **Pasting raw sub-agent output to user.** Synthesize to a 1-screen
   report.
4. **Weighting Twitter over GitHub.** Twitter is hype; GitHub is
   activity. GitHub is usually the better signal.
5. **Skipping the wrap-candidates table.** For many sessions, this is
   the most actionable output.
6. **Not caching research output.** Write to `research/market/<category>.md`
   so future sessions don't re-dispatch. Stale research is still
   worth something.

---

## Freshness + caching

Research output goes stale fast (trends move in weeks, not months).
Cache pattern:

- First research in a category: write to
  `research/market/<category>-<YYYYMMDD>.md`
- Subsequent sessions in same category: reuse if cache is <30 days;
  refresh if older.
- User can force refresh by asking explicitly.

Cache is a file artifact, not a tool. The user owns it.

---

## When `last30days` skill is available

If the `last30days` skill is installed in the environment (check for
`~/.claude/skills/last30days/` or plugin equivalent), dispatch it for
each source-specific temporal scoping instead of hand-rolling date
filters. It has better heuristics for "what's actually recent vs
just resurfaced" and caches across sessions.

Usage: delegate the temporal scoping to `last30days` and have this
skill consume its output.

If `last30days` is not available, the source-specific prompts above
include their own temporal scoping (60-90 days typical).
