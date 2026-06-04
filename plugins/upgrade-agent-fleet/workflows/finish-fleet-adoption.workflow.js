export const meta = {
  name: 'finish-fleet-adoption',
  description: 'Audit each fleet agent worktree against the FULL agent-app primitive surface (11 modules, by REAL import count not commit messages), then finish adoption of every applicable-but-unadopted module — deleting the hand-rolled duplication — looping Finish↔Adversarial-Verify (incl a coverage skeptic + a hollow-adoption skeptic) until two clean panels or a cap. Operates in the existing worktrees; never pushes.',
  phases: [
    { title: 'Audit', detail: 'per-module coverage matrix per agent: applicable? adopted (real imports)? remaining?' },
    { title: 'Finish', detail: 'adopt every applicable-but-unadopted module, delete duplication, keep green' },
    { title: 'Verify', detail: 'adversarial panel incl coverage + hollow-adoption lenses; loop-until-dry' },
    { title: 'Report', detail: 'final coverage matrix + deltas per agent' },
  ],
}

const cfg = {
  shell: args?.shell ?? '@tangle-network/agent-app',
  reference: args?.reference ?? 'reference-product',
  codeRoot: args?.codeRoot ?? '.',
  // repo-agnostic: the caller passes each product + its worktree via `args.agents`,
  // e.g. [{ name: '<product>', worktree: '<path>' }, ...].
  agents: args?.agents ?? [],
  // the full primitive surface agent-app exposes
  modules: args?.modules ?? [
    'tools', 'runtime', 'eval', 'integrations', 'tangle',
    'billing', 'delegation', 'crypto', 'web', 'redact', 'stream',
  ],
  maxRounds: args?.maxRounds ?? 3,
  cleanPanelsNeeded: args?.cleanPanelsNeeded ?? 2,
}

const COVERAGE = {
  type: 'object',
  required: ['agent', 'worktree', 'baseline', 'coverage'],
  properties: {
    agent: { type: 'string' },
    worktree: { type: 'string' },
    baseline: {
      type: 'object',
      required: ['testsPassing', 'typecheckClean', 'shellLoc'],
      properties: {
        testsPassing: { type: 'number' },
        typecheckClean: { type: 'boolean' },
        buildGreen: { type: 'boolean' },
        shellLoc: { type: 'number' },
        agentAppVersionedDep: { type: 'boolean', description: 'is agent-app a VERSIONED dependency (not just an array entry)?' },
      },
    },
    coverage: {
      type: 'array',
      description: 'one row per agent-app module',
      items: {
        type: 'object',
        required: ['module', 'applicable', 'adopted', 'realImportCount'],
        properties: {
          module: { type: 'string' },
          applicable: { type: 'boolean', description: 'does this agent have a use/hand-rolled equivalent for this module?' },
          adopted: { type: 'boolean', description: 'truly delegated — real imports of the subpath AND local duplication deleted' },
          realImportCount: { type: 'number', description: 'count of `@tangle-network/agent-app/<module>` (or root) imports in src for this concern' },
          localDuplicationFiles: { type: 'array', items: { type: 'string' }, description: 'hand-rolled files still holding logic this module would absorb' },
          remainingWork: { type: 'string' },
        },
      },
    },
    summary: { type: 'string' },
  },
}

const FINISH = {
  type: 'object',
  required: ['agent', 'worktree', 'modulesNewlyAdopted', 'final', 'claimsFullCoverage'],
  properties: {
    agent: { type: 'string' },
    worktree: { type: 'string' },
    modulesNewlyAdopted: { type: 'array', items: { type: 'string' } },
    duplicationDeleted: { type: 'array', items: { type: 'string' } },
    coverageFinal: {
      type: 'array',
      items: {
        type: 'object',
        required: ['module', 'applicable', 'adopted', 'realImportCount'],
        properties: {
          module: { type: 'string' },
          applicable: { type: 'boolean' },
          adopted: { type: 'boolean' },
          realImportCount: { type: 'number' },
        },
      },
    },
    final: {
      type: 'object',
      required: ['testsPassing', 'typecheckClean', 'buildGreen', 'shellLoc'],
      properties: {
        testsPassing: { type: 'number' },
        typecheckClean: { type: 'boolean' },
        buildGreen: { type: 'boolean' },
        shellLoc: { type: 'number' },
      },
    },
    upstreamCandidates: { type: 'array', items: { type: 'string' } },
    claimsFullCoverage: { type: 'boolean', description: 'every APPLICABLE module is adopted with real imports + duplication deleted' },
    summary: { type: 'string' },
  },
}

const VERDICT = {
  type: 'object',
  required: ['lens', 'refuted', 'evidence'],
  properties: {
    lens: { type: 'string' },
    refuted: { type: 'boolean' },
    evidence: { type: 'string', description: 'the command run + its output proving the verdict' },
    mustFix: { type: 'array', items: { type: 'string' } },
  },
}

const LENSES = [
  ['build', 'Prove typecheck/test/build FAIL in the worktree, or the test pass-count dropped below baseline. Run them; paste output.'],
  ['coverage', `Prove an APPLICABLE agent-app module is still NOT adopted: pick a module the audit marked applicable, show its hand-rolled equivalent still carries the logic (not a thin re-export) and that \`git grep -c "${cfg.shell}/<module>"\` in src is 0. Full coverage means EVERY applicable module delegates — refute if any doesn't.`],
  ['hollow', `Prove the adoption is HOLLOW: \`git grep -c "${cfg.shell}" -- src/\` near 0 despite adoption-named commits, or ${cfg.shell} only an array entry (e.g. minimumReleaseAgeExclude) not a VERSIONED dependency. Commit messages are NOT evidence; the import count is.`],
  ['shim', 'Prove a "deleted" local module is actually a second copy of the logic or a re-export that still imports local code.'],
  ['domain', 'Prove foreign-domain (forked-from) residue REMAINS: donor tokens, tables, flows, knowledge gates, or UI. grep the donor tokens.'],
  ['silent-cap', 'Prove the finish narrowed scope (skipped an applicable module, sampled, added .skip/TODO/@ts-expect-error) without declaring it.'],
]

function auditPrompt(a) {
  return `Audit the agent-app adoption coverage of the Tangle product ${a.name} in its worktree: ${a.worktree} (a git worktree on branch upgrade/agent-app; a prior run partially adopted ${cfg.shell}). Read-only — do not edit.

Reference consumer fully on ${cfg.shell}: ${cfg.codeRoot}/${cfg.reference}. agent-app exposes these modules: ${cfg.modules.join(', ')}.

For EACH module, determine in THIS worktree:
- applicable: does ${a.name} have a use or a hand-rolled equivalent for this concern? (e.g. /tools = structured agent→app side channel; /runtime = bounded tool loop + model config + openai-compat stream; /eval = completion verifier bridge; /integrations = hub client; /tangle = app-registration/broker token; /billing = per-workspace key manager; /delegation = driven-loop MCP; /crypto = field crypto; /web = request boundary utils; /redact = PII redaction; /stream = SSE normalize + turn identity.)
- adopted: is it TRULY delegated — \`git grep -c "${cfg.shell}/<module>"\` (or root import) in src is > 0 AND the hand-rolled equivalent is a thin re-export/deleted (not a second copy)?
- realImportCount: the actual import count (run git grep).
- localDuplicationFiles: hand-rolled files still holding logic this module would absorb.
- remainingWork: what's left to fully adopt it (empty if done or not applicable).

Also record baseline: \`pnpm typecheck\`, \`pnpm test\` pass count, build, hand-rolled shell LOC, and whether ${cfg.shell} is a VERSIONED dependency (not just an array entry). Return the structured coverage matrix. Commit messages are NOT evidence of adoption — the import count is.`
}

function finishPrompt(a, audit, priorRefutations) {
  return `Finish the ${cfg.shell} adoption of ${a.name} in its worktree: ${a.worktree}. Do ALL edits there; commit locally; NEVER push, NEVER touch main, NEVER --no-verify.

Audit coverage matrix:
${JSON.stringify(audit.coverage, null, 2)}

${priorRefutations?.length ? `A prior attempt was REFUTED. Resolve every one before claiming full coverage:\n${priorRefutations.map((r, i) => `${i + 1}. [${r.lens}] ${r.evidence}\n   fix: ${(r.mustFix || []).join('; ')}`).join('\n')}\n` : ''}

FOLLOW the \`build-agent-app\` skill for HOW to adopt each module (discovery, module seams, layering rule, lift-loop). This workflow's goal: FULL primitive coverage. For EVERY module the audit marked \`applicable:true, adopted:false\`:
- replace the hand-rolled equivalent with a thin delegate that imports ${cfg.shell}/<module>, then DELETE the original body (a surviving second copy is a failure).
- ensure ${cfg.shell} is a VERSIONED dependency (e.g. ^0.1.2), its engines (agent-eval, agent-integrations) are peerDependencies, and any minimumReleaseAge guard excludes ${cfg.shell}.
Real imports must exist — \`git grep -c "${cfg.shell}/<module>"\` > 0 for each adopted module. Strip any foreign-domain residue. Keep green after each module (typecheck → test → build). Do not weaken or .skip tests.

Return the structured result with the FINAL per-module coverage (real import counts), measured numbers, and claimsFullCoverage=true ONLY if every applicable module is delegated with real imports and you verified typecheck+test+build yourself.`
}

function refutePrompt(a, finish, lens, instruction) {
  return `You are the ${lens.toUpperCase()} skeptic verifying the ${a.name} agent-app adoption in worktree ${a.worktree}.

The implementer claims full coverage:
${JSON.stringify(finish, null, 2)}

Your job: ${instruction}

DEFAULT TO refuted=true. Set refuted=false only if a command you RAN in ${a.worktree} proves the claim for YOUR lens. Paste the exact command + output. If you refute, list concrete mustFix directives. Do not edit anything.`
}

const reports = (await parallel(cfg.agents.map((a) => async () => {
  const audit = await agent(auditPrompt(a), { label: `audit:${a.name}`, phase: 'Audit', schema: COVERAGE, agentType: 'Explore' })
  if (!audit) return { agent: a.name, status: 'audit-failed' }

  let refutations = a.seed || []
  let cleanStreak = 0
  let last = null
  for (let round = 1; round <= cfg.maxRounds; round++) {
    const finish = await agent(finishPrompt(a, audit, refutations), { label: `finish:${a.name}#${round}`, phase: 'Finish', schema: FINISH })
    if (!finish) { refutations = [{ lens: 'build', evidence: 'finish agent produced no result', mustFix: ['retry'] }]; cleanStreak = 0; continue }
    last = finish

    const verdicts = (await parallel(LENSES.map(([lens, instruction]) => () =>
      agent(refutePrompt(a, finish, lens, instruction), { label: `verify:${a.name}:${lens}#${round}`, phase: 'Verify', schema: VERDICT })
    ))).filter(Boolean)

    const refuted = verdicts.filter((v) => v.refuted)
    log(`${a.name} round ${round}: ${refuted.length}/${verdicts.length} lenses refute (clean streak ${cleanStreak})`)

    if (refuted.length === 0) {
      cleanStreak++
      if (cleanStreak >= cfg.cleanPanelsNeeded) {
        return { agent: a.name, status: 'FULL-COVERAGE', rounds: round, worktree: a.worktree, baseline: audit.baseline, final: finish.final, coverageFinal: finish.coverageFinal, modulesNewlyAdopted: finish.modulesNewlyAdopted, upstreamCandidates: finish.upstreamCandidates || [] }
      }
      refutations = []
    } else {
      cleanStreak = 0
      refutations = refuted
    }
  }
  return { agent: a.name, status: 'INCOMPLETE-CAPPED', rounds: cfg.maxRounds, worktree: a.worktree, baseline: audit.baseline, final: last?.final, coverageFinal: last?.coverageFinal, openRefutations: refutations }
}))).filter(Boolean)

phase('Report')
const full = reports.filter((r) => r.status === 'FULL-COVERAGE')
const upstream = [...new Set(reports.flatMap((r) => r.upstreamCandidates || []))]
log(`Finish-adoption: ${full.length}/${cfg.agents.length} at FULL primitive coverage.`)
return { summary: `${full.length}/${cfg.agents.length} full coverage`, agents: reports, upstreamCandidates: upstream, note: 'Worktrees verified, NOT pushed. Review coverageFinal per agent; merge + substrate-release upstream candidates.' }
