export const meta = {
  name: 'build-shell-v2',
  description: 'Build the open-source agent-app shell-v2 layers in dependency order on one branch: ③ config schema → ② preset-cloudflare backend → ④ knowledge-loop wiring → ⑤ create-agent-app scaffolder + breadcrumb docs. Each step commits and must stay green (typecheck/test/build); a final adversarial panel verifies the integrated branch. Does NOT publish or PR.',
  phases: [
    { title: 'Config', detail: '③ agent.config typed contract (the data surface everything reads)' },
    { title: 'Preset', detail: '② preset-cloudflare: D1/Drizzle/KV backend + default handlers + KnowledgeStateAccessor (zero-code path)' },
    { title: 'Loop', detail: '④ parameterize agent-knowledge research-loop from config (multimodal adapters + judge/sandbox gates)' },
    { title: 'Scaffold', detail: '⑤ create-agent-app + breadcrumb docs (AGENTS/CUSTOMIZE/KNOWLEDGE) + retarget build-agent-app skill' },
    { title: 'Verify', detail: 'adversarial integration check on the whole branch' },
  ],
}

const REPO = args?.repo ?? '.' // pass the agent-app repo path via args.repo
const BRANCH = args?.branch ?? 'feat/shell-v2'
const SHELL = '@tangle-network/agent-app'

const STEP = {
  type: 'object',
  required: ['step', 'filesTouched', 'green', 'claimsComplete', 'summary'],
  properties: {
    step: { type: 'string' },
    filesTouched: { type: 'array', items: { type: 'string' } },
    exportsAdded: { type: 'array', items: { type: 'string' } },
    green: {
      type: 'object',
      required: ['typecheck', 'test', 'build'],
      properties: {
        typecheck: { type: 'boolean' },
        test: { type: 'boolean' },
        build: { type: 'boolean' },
        testsPassing: { type: 'number' },
      },
    },
    commit: { type: 'string' },
    notesForNextStep: { type: 'string' },
    claimsComplete: { type: 'boolean' },
    summary: { type: 'string' },
  },
}

const VERDICT = {
  type: 'object',
  required: ['lens', 'refuted', 'evidence'],
  properties: {
    lens: { type: 'string' },
    refuted: { type: 'boolean' },
    evidence: { type: 'string' },
    mustFix: { type: 'array', items: { type: 'string' } },
  },
}

const COMMON = `Work in ${REPO} on branch ${BRANCH} (the FIRST step creates it off main; later steps just \`git checkout ${BRANCH}\` — it already exists with prior steps' commits, build on them). Commit your step locally with a conventional message. NEVER push, NEVER touch main, NEVER --no-verify, NEVER weaken or .skip tests.

Follow ${REPO}/AGENTS.md — the layering contract: engine packages (agent-eval/agent-runtime/agent-integrations/tcloud/sandbox) are peerDependencies, never bundled; compose by typed seam, never import product code; substrate-free where possible; ADDITIVE subpaths only — do NOT break the existing 11 modules (tools/runtime/eval/knowledge/integrations/tangle/billing/delegation/crypto/web/redact/stream) or their tests. New subpath = entry in tsup.config.ts + exports in package.json + barrel in src/index.ts.

KEEP GREEN: after your changes, \`pnpm typecheck\` clean, \`pnpm test\` >= the prior passing count (report it), \`pnpm build\` succeeds. Report green={typecheck,test,build,testsPassing}, the commit sha, and notesForNextStep (anything the next step needs — exact type names, paths, seam signatures).`

function configBrief() {
  return `STEP ③ — the agent.config typed contract (the central data surface a coding agent fills). ${COMMON}

Create \`src/config/index.ts\` (new subpath \`${SHELL}/config\`): a typed \`AgentAppConfig\` interface — the declarative domain surface from the locked design. It must cover, as DATA:
- identity: { name, persona, systemPromptFragments?: string[], disclaimers?: Record<string,string> }
- taxonomy: { proposalTypes: string[]; regulatedTypes: string[] }  (which proposal types exist + which are approval-gated/regulated)
- knowledge: { sources: Array<{ uri: string; kind?: string }>; requirements: KnowledgeRequirementSpec[]; loop?: { goal?: string; minConfidence?: number; freshness?: string } }  — reuse \`KnowledgeRequirementSpec\` + \`SatisfiedByRule\` from the EXISTING \`src/knowledge/index.ts\` (import/re-export them; do NOT redefine).
- integrations: { enabled: string[] }  (catalog kinds)
- delegation?: { enabled?: boolean }  — opt-in background-agent/loop delegation: the agent-runtime driven-loop MCP (the app's OWN agent spawns delegate_research/delegate_code loops that run to completion in their own sandbox and return artifacts). Sandbox-path only. Wired via the EXISTING src/delegation \`buildDelegationMcpServer\` — do NOT redefine it.
- ui?: { generatedUi?: boolean }
- model?: reuse the existing \`TangleModelConfig\` shape from \`src/runtime\` (resolveTangleModelConfig) — reference it, don't redefine.
Add a \`defineAgentApp(config: AgentAppConfig): AgentAppConfig\` identity helper (gives coding agents autocomplete + a single import). Add a JSON-schema export or thorough inline JSDoc on every field (this is the schema-floor any coding agent reads). Real tests: a valid config typechecks; defineAgentApp round-trips; required vs optional fields enforced. This is the contract steps ②④⑤ build against — make the field names final and document them in notesForNextStep.`
}

function presetBrief(prior) {
  return `STEP ② — preset-cloudflare: the batteries-included backend that makes the zero-code path real. ${COMMON}

Prior step output:\n${JSON.stringify(prior, null, 2)}\n
Create \`src/preset-cloudflare/index.ts\` (new subpath \`${SHELL}/preset-cloudflare\`). It composes the existing shell seams against a default Cloudflare stack (D1 + Drizzle + KV) — every fleet agent already runs this exact stack, so this is the house stack packaged:
- A default Drizzle schema (proposals/threads/knowledge/deadlines) — the tables the default handlers write. Export it so a consumer can run migrations.
- Default \`AppToolHandlers\` (from \`src/tools\`) wired to that schema + a KV vault: submit_proposal -> a proposals row, render_ui -> a vault artifact, add_citation -> a vault artifact, schedule_followup -> a deadlines/tasks row.
- A \`KnowledgeStateAccessor\` implementation (the seam from \`src/knowledge\`) over the D1 schema: \`config\` reads workspace config, \`count\` runs \`SELECT count(*)\` with the where/statusIn filter — so the declarative \`satisfiedBy\` rules resolve with zero consumer code.
- A field-crypto + per-workspace key wiring using the existing \`src/crypto\` + \`src/billing\` seams.
- When \`config.delegation?.enabled\`, spread the OPTIONAL delegation MCP (\`buildDelegationMcpServer\` from \`src/delegation\`) into the sandbox profile's mcp map (background-agent/loop delegation; follow the reference consumer's sandbox profile wiring). Sandbox path ONLY; the browser/edge zero-code path skips it.
Drizzle is a peerDependency (NOT bundled) — the consumer installs it. D1/KV are structural (\`KvLike\` already exists in \`src/web\`). Real tests with an in-memory fake DB/KV: a submit_proposal handler writes a row; the accessor's count resolves a satisfiedBy rule end-to-end. This is the proof that config-only (no handler code) works.`
}

function loopBrief(prior) {
  return `STEP ④ — knowledge-loop wiring: parameterize agent-knowledge's research-loop from config. ${COMMON}

Prior steps output:\n${JSON.stringify(prior, null, 2)}\n
Create \`src/knowledge-loop/index.ts\` (new subpath \`${SHELL}/knowledge-loop\`). It does NOT reimplement a loop — \`@tangle-network/agent-knowledge\` already ships \`research-loop\` (source-grounded, eval-gated, propose-don't-apply, confidence/judge/freshness gating) and pluggable \`SourceAdapter\` + a pluggable \`decide\` gate. Read agent-knowledge's exports (research-loop.ts, adapters.ts, proposals.ts) first. Build a thin \`createKnowledgeLoop(config.knowledge, deps)\` that:
- maps the config's \`sources\` to agent-knowledge source adapters (text default; expose an \`adapters\` seam so audio/video/image adapters can be added — multimodal),
- maps the config's \`loop\` params (goal, minConfidence, freshness) onto the research-loop options,
- accepts a pluggable \`decide\` gate seam (an agentic judge OR a sandbox run — do not hard-code; default to agent-knowledge's reviewer policy with the config's minConfidence),
- composes the agent-runtime driver for the loop's agent turns.
agent-knowledge + agent-runtime are peerDependencies (add to peerDeps if missing; do NOT bundle). Real tests with fakes: the loop maps config sources->adapters and minConfidence->the gate; a low-confidence proposal is gated OUT, a high-confidence one is accepted (propose-don't-apply). Keep it substrate-free behind seams.`
}

function scaffoldBrief(prior) {
  return `STEP ⑤ — create-agent-app scaffolder + breadcrumb docs + skill retarget. ${COMMON}

Prior steps output:\n${JSON.stringify(prior, null, 2)}\n
Two deliverables:

(A) A scaffolder under \`packages/create-agent-app/\` (or \`create-agent-app/\` in the repo if it's not a monorepo — check) — an \`npx create-agent-app\`-style CLI that generates a new project depending on \`${SHELL}\` + \`${SHELL}/preset-cloudflare\`, with: a filled-skeleton \`agent.config.ts\` (using \`defineAgentApp\` from step ③, every field stubbed + JSDoc'd), an empty \`knowledge/\` dir with a README, a wired chat route + the preset, and \`package.json\` scripts (dev, typecheck, test, \`knowledge:ingest\`). Keep the CLI minimal + dependency-light. Real test: generating into a temp dir produces a typechecking skeleton.

(B) The breadcrumb docs the scaffold emits — written in IMPERATIVE, agent-followable checklist form (a trail an agent walks), NOT prose:
- \`AGENTS.md\` (+ \`CLAUDE.md\`): behavior contract — "you are customizing an agent-app": the layering rule, what is DATA (agent.config + knowledge/) vs CODE (handler overrides), invariants (human-in-the-loop, fail-closed), verify with typecheck/test/build.
- \`CUSTOMIZE.md\`: the ordered fill-checklist — ① identity ② taxonomy (+ regulated) ③ knowledge-requirement satisfiedBy specs ④ drop domain docs in knowledge/ + list research sources ⑤ enable integrations ⑥ pnpm knowledge:ingest ⑦ verify — each step paired with the discovery question it answers.
- \`KNOWLEDGE.md\`: build-loop vs act-gate, pointing at multimodal sources, tuning gating (judges/confidence/freshness).
Put canonical copies under the scaffolder's template dir.

(C) Retarget the existing \`build-agent-app\` skill (canonical at ~/code/dotfiles/claude/skills/build-agent-app/SKILL.md AND/OR ~/code/skills/plugins/build-agent-app) so it drives THIS flow (npx create-agent-app -> interview the user -> fill agent.config + seed knowledge/ -> run ingest). Add a short section pointing at the breadcrumb docs as the schema-floor it drives. If the skill isn't found, note it in your summary instead of failing.`
}

function refuteBrief(lens, instruction, steps) {
  return `You are the ${lens.toUpperCase()} skeptic verifying the integrated shell-v2 build in ${REPO} (branch ${BRANCH}). Steps claimed:\n${JSON.stringify(steps.map((s) => ({ step: s?.step, commit: s?.commit, green: s?.green, complete: s?.claimsComplete })), null, 2)}\n
Your job: ${instruction}\nDEFAULT TO refuted=true. Only refuted=false if a command you RAN in ${REPO} on ${BRANCH} proves it. Paste the command + output. List concrete mustFix if refuted. Do not edit.`
}

// ── sequential build (dependency order) ──────────────────────────────────────
phase('Config')
const config = await agent(configBrief(), { label: 'step3:config', phase: 'Config', schema: STEP })
phase('Preset')
const preset = await agent(presetBrief(config), { label: 'step2:preset', phase: 'Preset', schema: STEP })
phase('Loop')
const loop = await agent(loopBrief({ config, preset }), { label: 'step4:loop', phase: 'Loop', schema: STEP })
phase('Scaffold')
const scaffold = await agent(scaffoldBrief({ config, preset, loop }), { label: 'step5:scaffold', phase: 'Scaffold', schema: STEP })

const steps = [config, preset, loop, scaffold].filter(Boolean)

// ── adversarial integration check on the whole branch ────────────────────────
phase('Verify')
const LENSES = [
  ['build', `Run \`pnpm typecheck && pnpm test && pnpm build\` in ${REPO} on ${BRANCH}. Prove ANY fails, or the test count dropped below the pre-build baseline (104). Paste output.`],
  ['additive', 'Prove a NEW subpath is missing its wiring (not in tsup.config.ts entry OR package.json exports OR src/index.ts barrel), or that an EXISTING module/test was broken/altered.'],
  ['stub', 'Prove a step shipped a stub/placeholder/TODO instead of working code (grep TODO/FIXME/throw new Error("not implemented"); check the zero-code preset path actually writes rows + resolves a satisfiedBy rule in a test).'],
  ['layering', 'Prove a layering violation: an engine (drizzle/agent-knowledge/agent-runtime) bundled as a dependency instead of peerDependency, or product code imported, or a domain value hard-coded into the shell.'],
  ['seam', 'Prove the config contract drifted: a field step ②/④/⑤ relies on does not exist in step ③ src/config, or KnowledgeRequirementSpec was redefined instead of reused from src/knowledge.'],
]
const verdicts = (await parallel(LENSES.map(([lens, instruction]) => () =>
  agent(refuteBrief(lens, instruction, steps), { label: `verify:${lens}`, phase: 'Verify', schema: VERDICT })
))).filter(Boolean)

const refuted = verdicts.filter((v) => v.refuted)
log(`shell-v2 build: ${steps.filter((s) => s?.claimsComplete).length}/4 steps claim complete; ${refuted.length}/${verdicts.length} lenses refute`)
return {
  branch: BRANCH,
  steps: steps.map((s) => ({ step: s?.step, commit: s?.commit, green: s?.green, complete: s?.claimsComplete, summary: s?.summary })),
  openRefutations: refuted,
  clean: refuted.length === 0,
  note: `Branch ${BRANCH} in ${REPO} — verified but NOT pushed/published. Review, then PR + tag for a 0.1.4 OIDC publish, then fleet adoption.`,
}
