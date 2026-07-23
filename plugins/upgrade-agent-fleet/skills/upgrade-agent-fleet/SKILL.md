---
name: upgrade-agent-fleet
description: Upgrade Tangle agent products to shared packages, remove copied code, and prove each migration.
---

# Upgrade Agent Fleet

Use this when two or more product repositories need the same shared-package migration.
Use the owning adoption skill directly for one repository.

The target is not “make every repository look like the reference.”
The target is “make each product use the current shared contract while preserving its own behavior.”

## Define The Migration Contract

Read the current package README, exports, types, release notes, and one maintained consumer.
Record:

- exact package and target version;
- shared behavior moving into the package;
- product behavior that must remain local;
- expected compatibility changes;
- one real user flow that proves each migration;
- required repository checks and release authority.

A reference product is evidence, not an API specification.
Do not copy its schema, domain policy, routes, or obsolete wrappers into the fleet.

## Audit Every Repository

Inspect each product independently and produce:

- current branch, dirty state, lockfile, and package versions;
- production entrypoint and selected user flow;
- local implementations that duplicate the target package;
- product adapters and compatibility contracts that must remain;
- dead or foreign-domain code with importer evidence;
- current typecheck, test, build, and product-flow commands;
- risks and any package capability genuinely missing.

Do not infer adoption from commit messages, dependency text, or matching filenames.
Trace the production import and execution path.

## Execute In Parallel

Use one isolated worktree and one owner per repository.
Repositories may run concurrently because their histories and checks are independent.
Within a repository, migrate coherent concerns in dependency order and keep checks runnable after each change.

Each owner follows the relevant adoption skill and current package source.
They must:

1. import the current shared implementation;
2. adapt product-owned policy at a typed boundary;
3. remove the competing reachable path;
4. preserve intentional wire and data compatibility;
5. add or update a regression for the selected user flow;
6. record generic missing behavior as an upstream package change instead of copying it locally.

## Verify Independently

A fresh reviewer reads the diff and reruns evidence for each repository.
Approval requires:

- the dependency resolves at the intended version;
- production code reaches the shared package;
- the old implementation is deleted or demonstrably unreachable;
- retained wrappers add product policy, persistence, or compatibility;
- typecheck, relevant tests, build, and the selected user flow pass;
- denied actions, failures, and retries preserve their intended behavior;
- no unrelated domain code, disabled checks, or hidden fallback was introduced;
- the branch merges cleanly with current main.

Test count and line count are diagnostics, not pass conditions.
Repeated reviews by the same model do not create independent evidence.
When review finds a defect, feed its exact file, command, and failure back to the repository owner and rerun the failed check.
A repository that hits its retry limit remains incomplete with named findings.

## Merge And Report

Refresh each branch against current main before merge.
Merge in dependency order when repositories depend on a newly released package.
After each push, read current checks and reviews rather than relying on an earlier verdict.

Report one row per repository with branch, versions before and after, migrated concerns, deleted competing paths, retained adapters, user-flow result, checks, review findings, merge state, and upstream package work.
Include incomplete repositories and unchecked dependencies.

## Then consider

- `build-agent-app` for product-shell migrations.
- `agent-stack-adoption` for runtime, eval, profile, and knowledge boundaries.
- `substrate-release` when a shared package change must ship before consumers update.
- `review-to-green` for a branch with unresolved review or CI findings.
