export const meta = {
  name: 'upgrade-agent-fleet',
  description: 'Fan out across a fleet of Tangle agent products; per agent, discover the hand-rolled shell, adopt @tangle-network/agent-app + strip fork-inherited domain residue, then loop Upgrade↔Adversarial-Verify until a clean panel verdict twice running (or a retry cap). Worktree-isolated, never pushes.',
  phases: [
    { title: 'Discover', detail: 'map each agent shell surface + foreign-domain residue onto agent-app modules' },
    { title: 'Upgrade', detail: 'adopt agent-app, delete duplication, strip residue, keep green (per agent, in a worktree)' },
    { title: 'Verify', detail: 'adversarial skeptic panel tries to refute completion; loop-until-dry' },
    { title: 'Report', detail: 'per-agent verdict, deltas, residue removed, upstream candidates' },
  ],
}

// ---- inputs (with sane defaults so the script is self-contained) -----------
const cfg = {
  // repo-agnostic: the caller passes the real reference + fleet via `args`.
  reference: args?.reference ?? 'reference-product',
  shell: args?.shell ?? '@tangle-network/agent-app',
  agents: args?.agents ?? [],
  codeRoot: args?.codeRoot ?? '.',
  donorDomainTokens: args?.donorDomainTokens ?? {},
  maxRounds: args?.maxRounds ?? 4,
  cleanPanelsNeeded: args?.cleanPanelsNeeded ?? 2,
}

// ---- structured schemas the agents must return ----------------------------
const DISCOVERY = {
  type: 'object',
  required: ['agent', 'baseline', 'moduleMap', 'residue', 'userStories'],
  properties: {
    agent: { type: 'string' },
    baseline: {
      type: 'object',
      required: ['testsPassing', 'typecheckClean', 'shellLoc'],
      properties: {
        testsPassing: { type: 'number' },
        typecheckClean: { type: 'boolean' },
        shellLoc: { type: 'number' },
        notes: { type: 'string' },
      },
    },
    moduleMap: {
      type: 'array',
      description: 'one row per agent-app module that has a hand-rolled local equivalent',
      items: {
        type: 'object',
        required: ['module', 'localFiles', 'action'],
        properties: {
          module: { type: 'string' },
          localFiles: { type: 'array', items: { type: 'string' } },
          action: { type: 'string', enum: ['delegate', 'delete', 'upstream-then-delegate', 'absent'] },
          note: { type: 'string' },
        },
      },
    },
    residue: {
      type: 'array',
      description: 'foreign-domain (forked-from) code that must be stripped or domain-replaced',
      items: {
        type: 'object',
        required: ['kind', 'evidence'],
        properties: {
          kind: { type: 'string', enum: ['flow', 'knowledge-gate', 'schema-table', 'integration', 'eval-scaffold', 'route', 'other'] },
          evidence: { type: 'string' },
          plan: { type: 'string' },
        },
      },
    },
    userStories: { type: 'array', items: { type: 'string' } },
    upstreamCandidates: { type: 'array', items: { type: 'string' } },
  },
}

const UPGRADE = {
  type: 'object',
  required: ['agent', 'worktree', 'modulesSwapped', 'residueRemoved', 'final', 'claimsComplete'],
  properties: {
    agent: { type: 'string' },
    worktree: { type: 'string', description: 'absolute path to the worktree the work landed in' },
    modulesSwapped: { type: 'array', items: { type: 'string' } },
    residueRemoved: { type: 'array', items: { type: 'string' } },
    storiesValidated: { type: 'array', items: { type: 'string' } },
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
    claimsComplete: { type: 'boolean' },
    summary: { type: 'string' },
  },
}

const VERDICT = {
  type: 'object',
  required: ['lens', 'refuted', 'evidence'],
  properties: {
    lens: { type: 'string' },
    refuted: { type: 'boolean', description: 'true = this skeptic REFUTES the completion claim' },
    evidence: { type: 'string', description: 'the command run + its output that proves the verdict' },
    mustFix: { type: 'array', items: { type: 'string' }, description: 'directives for the next Upgrade if refuted' },
  },
}

const LENSES = [
  ['build', 'Prove typecheck/test/build FAIL or the test pass-count dropped below baseline. Run them; paste output.'],
  ['shim', 'Prove a "deleted" local module is actually a second copy of the logic or a re-export that still imports local code. grep for the lifted logic.'],
  ['resolution', `Prove the adoption is HOLLOW. Run \`git grep -c "${cfg.shell}" -- src/\` in the worktree: if the real import count is 0 (or did not rise to roughly one-per-swapped-module), the commits are adoption-named but empty — REFUTE. Also refute if ${cfg.shell} appears only in an array (e.g. minimumReleaseAgeExclude) rather than as a VERSIONED dependency, or if imports resolve to a local path / the lockfile never moved. Adoption-sounding commit messages are NOT evidence; the import count is.`],
  ['domain', 'Prove foreign-domain (forked-from) residue REMAINS: donor tokens, tables, flows, knowledge gates, or UI. grep the donor tokens.'],
  ['story', 'Prove a claimed user story has NO executable check, or its check is trivially true / disabled.'],
  ['silent-cap', 'Prove the upgrade narrowed scope (skipped a module, sampled, added .skip / TODO) without declaring it.'],
]

// ---- helpers ---------------------------------------------------------------
function discoverPrompt(agent) {
  const donor = cfg.donorDomainTokens[agent]
  return `You are auditing the Tangle agent product at ${cfg.codeRoot}/${agent} to plan its upgrade onto the shared shell ${cfg.shell}.
Reference consumer (the standard to match) is ${cfg.codeRoot}/${cfg.reference}, which is 100% on ${cfg.shell}. Read how it delegates (its src imports of ${cfg.shell}) to learn the target shape.

Do NOT grep the reference's symbol names against ${agent} — each agent NAMES the same mechanism differently; you must read ${agent}'s own code and map ITS shell surface onto ${cfg.shell}'s modules (/tools /runtime /eval /integrations /tangle /billing /delegation /crypto /web /redact /stream).

Record the BASELINE first: run \`pnpm -C ${cfg.codeRoot}/${agent} typecheck\` and \`pnpm -C ${cfg.codeRoot}/${agent} test\` (or the repo's equivalents) and capture the passing-test count + whether typecheck is clean + a rough hand-rolled-shell LOC.

Then hunt FOREIGN-DOMAIN RESIDUE — code inherited from whatever this agent forked from, still present under this agent's branding (flows, knowledge-gates wired into the live chat loop, schema tables, eval scaffolding, integrations, routes).${donor ? ` For this agent, probe these donor-domain tokens: ${JSON.stringify(donor)} — grep them case-insensitively across src/ and treat every hit as residue until proven domain-correct.` : ' Infer the donor domain from the code and probe its tokens.'}

Return the structured discovery: baseline, moduleMap (one row per agent-app module with the local files + action), residue (with evidence + a plan per item), concrete userStories to validate, and any upstreamCandidates (generic mechanisms this agent has that ${cfg.shell} lacks). Read-only — do not edit anything.`
}

function upgradePrompt(agent, discovery, priorRefutations) {
  return `Upgrade the Tangle agent product ${agent} onto ${cfg.shell}.

ISOLATION (do this FIRST, exactly): the target repo ${cfg.codeRoot}/${agent} has pre-existing uncommitted in-flight work that is NOT yours — do not touch, stash, or discard it. Create a dedicated worktree of the TARGET repo and do ALL your edits there:
  git -C ${cfg.codeRoot}/${agent} worktree add -b upgrade/agent-app ${cfg.codeRoot}/${agent}-agentapp-upgrade HEAD
(if that path/branch exists from a prior round, reuse it). Work, install, and run tests inside ${cfg.codeRoot}/${agent}-agentapp-upgrade. Commit your work there locally. NEVER push, NEVER touch main, NEVER use --no-verify. Report that worktree path as "worktree".

Plan from discovery:
${JSON.stringify(discovery, null, 2)}

${priorRefutations?.length ? `A prior attempt was REFUTED by the adversarial panel. You MUST resolve every one of these before claiming complete:\n${priorRefutations.map((r, i) => `${i + 1}. [${r.lens}] ${r.evidence}\n   fix: ${(r.mustFix || []).join('; ')}`).join('\n')}\n` : ''}

FOLLOW THE \`build-agent-app\` SKILL for the adoption procedure itself — discovery, module seams, the layering rule (engine vs shell vs domain), the migration lift-loop, sandbox/non-sandbox wiring, anti-patterns. Do not improvise a different procedure; build-agent-app is the single source of truth for HOW to adopt ${cfg.shell}. Apply it against the moduleMap above. This workflow only adds the two deltas below.

Delta directives (on top of build-agent-app):
A. STRIP foreign-domain residue from the discovery's residue list — delete foreign flows/tables/routes/eval-scaffold; for a residue that is a needed MECHANISM (e.g. a knowledge-gate wired into the live chat loop), domain-REPLACE it with THIS agent's own model rather than deleting into a hole that breaks the loop.
B. Engines stay peerDependencies, never bundled; respect any minimumReleaseAge guard (add ${cfg.shell} to minimumReleaseAgeExclude). Upstream candidates are NOT localized — note them for substrate-release.
Keep green after EACH change (typecheck → test → build), and validate each user story with a real executable check.

COMPLETION CRITERIA (all must hold, each proven by command output): typecheck clean; tests ≥ baseline (${discovery.baseline.testsPassing}); build green; ${cfg.shell} resolves in the lockfile and is imported per swapped module; no duplicated logic remains; donor-domain token probe returns 0 (or every hit justified); no new .skip/@ts-expect-error/fake fallback; shell LOC strictly below baseline (${discovery.baseline.shellLoc}).

Return the structured upgrade result with the worktree path, what you swapped/removed/validated, the FINAL measured numbers, and claimsComplete=true ONLY if you verified every criterion yourself by running the commands.`
}

function refutePrompt(agent, worktree, upgrade, lens, instruction) {
  return `You are the ${lens.toUpperCase()} skeptic on the adversarial panel for the ${agent} upgrade onto ${cfg.shell}. The implementer's worktree is at: ${worktree}.

The implementer claims complete with this result:
${JSON.stringify(upgrade, null, 2)}

Your job: ${instruction}

DEFAULT TO refuted=true. Only set refuted=false if you have RUN a command (typecheck/test/build/grep/lockfile inspection) inside ${worktree} and its output proves the claim for YOUR lens specifically. Paste the exact command + output as evidence. If you refute, list concrete mustFix directives the implementer must satisfy. Do not edit anything — you only verify.`
}

// ---- run -------------------------------------------------------------------
const reports = (await parallel(cfg.agents.map((agentName) => async () => {
  // 1) Discover (read-only, no worktree needed)
  const discovery = await agent(
    discoverPrompt(agentName),
    { label: `discover:${agentName}`, phase: 'Discover', schema: DISCOVERY, agentType: 'Explore' },
  )
  if (!discovery) return { agent: agentName, status: 'discovery-failed' }

  // 2) Upgrade ↔ Verify loop until two clean panels, or maxRounds cap.
  let refutations = []
  let cleanStreak = 0
  let lastUpgrade = null
  for (let round = 1; round <= cfg.maxRounds; round++) {
    const upgrade = await agent(
      upgradePrompt(agentName, discovery, refutations),
      { label: `upgrade:${agentName}#${round}`, phase: 'Upgrade', schema: UPGRADE },
    )
    if (!upgrade) { refutations = [{ lens: 'build', evidence: 'upgrade agent produced no result', mustFix: ['retry'] }]; cleanStreak = 0; continue }
    lastUpgrade = upgrade

    // adversarial panel — every lens in parallel, each defaulting to refute
    const verdicts = (await parallel(LENSES.map(([lens, instruction]) => () =>
      agent(refutePrompt(agentName, upgrade.worktree, upgrade, lens, instruction),
        { label: `verify:${agentName}:${lens}#${round}`, phase: 'Verify', schema: VERDICT })
    ))).filter(Boolean)

    const refuted = verdicts.filter((v) => v.refuted)
    log(`${agentName} round ${round}: ${refuted.length}/${verdicts.length} lenses refute (clean streak ${cleanStreak})`)

    if (refuted.length === 0) {
      cleanStreak++
      if (cleanStreak >= cfg.cleanPanelsNeeded) {
        return { agent: agentName, status: 'COMPLETE', rounds: round, worktree: upgrade.worktree, baseline: discovery.baseline, final: upgrade.final, modulesSwapped: upgrade.modulesSwapped, residueRemoved: upgrade.residueRemoved, upstreamCandidates: [...(discovery.upstreamCandidates || []), ...(upgrade.upstreamCandidates || [])] }
      }
      refutations = [] // re-verify once more to satisfy loop-until-dry
    } else {
      cleanStreak = 0
      refutations = refuted
    }
  }
  return { agent: agentName, status: 'INCOMPLETE-CAPPED', rounds: cfg.maxRounds, worktree: lastUpgrade?.worktree, baseline: discovery.baseline, final: lastUpgrade?.final, openRefutations: refutations }
}))).filter(Boolean)

// 3) Report
phase('Report')
const complete = reports.filter((r) => r.status === 'COMPLETE')
const upstream = [...new Set(reports.flatMap((r) => r.upstreamCandidates || []))]
log(`Fleet upgrade: ${complete.length}/${cfg.agents.length} agents COMPLETE. Upstream candidates: ${upstream.length}.`)
return {
  summary: `${complete.length}/${cfg.agents.length} complete`,
  agents: reports,
  upstreamCandidates: upstream,
  note: 'Worktrees are verified but NOT pushed. Merge the green worktrees and run substrate-release for upstream candidates.',
}
