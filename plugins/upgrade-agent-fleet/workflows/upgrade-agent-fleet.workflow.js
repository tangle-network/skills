export const meta = {
  name: 'upgrade-agent-fleet',
  description: 'Audit product repositories, migrate each in an isolated worktree, and independently verify one real product flow before approval.',
  phases: [
    { title: 'Audit', detail: 'read each product and the current shared package contract' },
    { title: 'Migrate', detail: 'run independent repository migrations in parallel worktrees' },
    { title: 'Review', detail: 'rerun repository checks and inspect the replaced production path' },
    { title: 'Report', detail: 'return approved and incomplete branches with exact evidence' },
  ],
}

const cfg = {
  packageName: args?.packageName ?? '@tangle-network/agent-app',
  packagePath: args?.packagePath ?? null,
  repositories: args?.repositories ?? [],
  maxRounds: args?.maxRounds ?? 3,
}

const AUDIT = {
  type: 'object',
  required: ['name', 'path', 'productionFlow', 'currentVersion', 'targetVersion', 'checks'],
  properties: {
    name: { type: 'string' },
    path: { type: 'string' },
    productionFlow: { type: 'string' },
    currentVersion: { type: ['string', 'null'] },
    targetVersion: { type: 'string' },
    duplicatePaths: { type: 'array', items: { type: 'string' } },
    retainedAdapters: { type: 'array', items: { type: 'string' } },
    foreignResidue: { type: 'array', items: { type: 'string' } },
    missingPackageBehavior: { type: 'array', items: { type: 'string' } },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['command', 'exitCode'],
        properties: {
          command: { type: 'string' },
          exitCode: { type: 'number' },
          summary: { type: 'string' },
        },
      },
    },
    risks: { type: 'array', items: { type: 'string' } },
  },
}

const MIGRATION = {
  type: 'object',
  required: ['name', 'worktree', 'branch', 'complete', 'checks'],
  properties: {
    name: { type: 'string' },
    worktree: { type: 'string' },
    branch: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    removedPaths: { type: 'array', items: { type: 'string' } },
    retainedAdapters: { type: 'array', items: { type: 'string' } },
    flowEvidence: { type: 'string' },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['command', 'exitCode'],
        properties: {
          command: { type: 'string' },
          exitCode: { type: 'number' },
          summary: { type: 'string' },
        },
      },
    },
    upstreamWork: { type: 'array', items: { type: 'string' } },
    complete: { type: 'boolean' },
  },
}

const REVIEW = {
  type: 'object',
  required: ['approved', 'checks', 'findings'],
  properties: {
    approved: { type: 'boolean' },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['command', 'exitCode'],
        properties: {
          command: { type: 'string' },
          exitCode: { type: 'number' },
          summary: { type: 'string' },
        },
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['severity', 'evidence', 'fix'],
        properties: {
          severity: { type: 'string' },
          path: { type: 'string' },
          evidence: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
  },
}

function auditPrompt(repo) {
  return `Audit ${repo.path} for migration to ${cfg.packageName}.

Read the repository instructions, git state, lockfile, production entrypoint, and one real user flow.
Read the current ${cfg.packageName} README, exports, types, and implementation${cfg.packagePath ? ` at ${cfg.packagePath}` : ''}.
Treat a maintained consumer as evidence only, not as the API definition.

Run the repository's cheap baseline checks.
Trace the production path and identify local code that duplicates the package, product adapters that must remain, foreign product residue, and missing behavior that belongs upstream.
Do not edit files.
Return exact commands and exit codes.`
}

function migrationPrompt(audit, priorFindings) {
  return `Migrate ${audit.path} to ${cfg.packageName} using an isolated worktree and a unique branch.

Audit:
${JSON.stringify(audit, null, 2)}

${priorFindings?.length ? `The prior review found these defects:\n${JSON.stringify(priorFindings, null, 2)}\n` : ''}
Read the current package source and relevant adoption skill before editing.
Import the shared implementation, retain product policy at typed boundaries, and remove the competing reachable path.
Preserve intentional wire, data, identity, approval, retry, and error behavior.
Add or update a regression for the selected production flow.
Do not use test count or line count as completion criteria.
Do not push.

Run typecheck, relevant tests, build, and the selected user flow.
Return the worktree, branch, changed and removed paths, exact commands and exit codes, product-flow evidence, and any missing behavior that must be implemented upstream.
Set complete only when every required command passes.`
}

function reviewPrompt(audit, migration) {
  return `Independently review the migration in ${migration.worktree}.

Audit:
${JSON.stringify(audit, null, 2)}

Migration claim:
${JSON.stringify(migration, null, 2)}

Read the diff and current package contract.
Rerun the repository checks and selected product flow.
Prove production code reaches ${cfg.packageName}, the replaced path is deleted or unreachable, retained wrappers add product behavior, denied actions and failures still behave correctly, and the branch merges with current main.
Look for disabled checks, hidden fallbacks, unrelated domain residue, and duplicate implementations.
Do not edit files.
Approve only from commands and inspected code.
Return each finding with severity, path, evidence, and exact fix.`
}

if (cfg.repositories.length === 0) {
  return { summary: '0 repositories supplied', repositories: [] }
}

phase('Audit')
const audits = (await parallel(cfg.repositories.map((repo) => () =>
  agent(auditPrompt(repo), {
    label: `audit:${repo.name}`,
    phase: 'Audit',
    agentType: 'Explore',
    schema: AUDIT,
  })
))).filter(Boolean)

phase('Migrate')
const reports = (await parallel(audits.map((audit) => async () => {
  let findings = []
  let lastMigration = null
  let lastReview = null

  for (let round = 1; round <= cfg.maxRounds; round++) {
    const migration = await agent(migrationPrompt(audit, findings), {
      label: `migrate:${audit.name}:${round}`,
      phase: 'Migrate',
      schema: MIGRATION,
    })
    if (!migration) {
      findings = [{ severity: 'blocking', evidence: 'migration returned no result', fix: 'rerun the migration' }]
      continue
    }
    lastMigration = migration

    phase('Review')
    const review = await agent(reviewPrompt(audit, migration), {
      label: `review:${audit.name}:${round}`,
      phase: 'Review',
      agentType: 'Explore',
      schema: REVIEW,
    })
    lastReview = review
    if (review?.approved) {
      return { name: audit.name, status: 'approved', audit, migration, review }
    }
    findings = review?.findings ?? [{ severity: 'blocking', evidence: 'review returned no result', fix: 'rerun independent review' }]
  }

  return {
    name: audit.name,
    status: 'incomplete',
    audit,
    migration: lastMigration,
    review: lastReview,
    openFindings: findings,
  }
}))).filter(Boolean)

phase('Report')
const approved = reports.filter((report) => report.status === 'approved').length
return {
  summary: `${approved}/${cfg.repositories.length} repositories approved`,
  repositories: reports,
  uncheckedRepositories: cfg.repositories.filter(
    (repo) => !audits.some((audit) => audit.name === repo.name),
  ),
}
