# Plan 001: Derive workspace tasks from the workspace manifest

> **Executor instructions**: Follow this plan step by step. Run every verification command before continuing. Stop on any STOP condition. Update the status row in `plans/README.md` when complete.
>
> **Drift check**: `git diff --stat 9643d54..HEAD -- package.json scripts/run-workspaces.ts` must be empty or reviewed against the excerpts below.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `9643d54`, 2026-08-31

## Why this matters

The root manifest declares `packages/*` as the workspace, but the task runner separately hardcodes two package directories. A future package can therefore exist in the workspace and still be omitted from root verification, which creates false-green CI. Make the runner discover package directories from the manifest or another single source of truth while preserving deterministic order and current task behavior.

## Current state

- `package.json:6-8` declares the workspace as `packages/*`.
- `scripts/run-workspaces.ts:26-29` hardcodes `packages/opencode-force-input` and `packages/opencode-usage-limits`.
- `scripts/run-workspaces.ts:31-42` runs each directory sequentially with `Bun.spawnSync` and stops on the first failure.
- Match the repository's TypeScript-first style and Bun-only command execution from `AGENTS.md`.

## Commands you will need

| Purpose             | Command                | Expected                |
| ------------------- | ---------------------- | ----------------------- |
| Typecheck           | `bun run typecheck`    | exit 0                  |
| Checks              | `bun run check`        | no warnings/errors      |
| Tests               | `bun run test`         | all tests pass          |
| Package smoke tests | `bun run test:package` | all package checks pass |

## Scope

**In scope**

- `scripts/run-workspaces.ts`
- `package.json` only if a minimal manifest metadata change is required
- `scripts/__tests__/` only if an existing test convention is found and a focused test is needed

**Out of scope**

- Package source code
- CI workflow structure
- Changeset files

## Steps

### Step 1: Replace the duplicate package list

Use the declared workspace pattern or a small manifest-derived discovery routine. Preserve package ordering, skip directories without a package manifest if discovery requires it, and keep failure exit codes unchanged. Do not introduce a dependency.

**Verify**: `bun run typecheck` -> exit 0.

### Step 2: Verify root task coverage

Run the runner for `check` or `test` and confirm both existing package directories appear exactly once in the output. If discovery makes ordering nondeterministic, sort it explicitly.

**Verify**: `bun run test` -> both packages run and all tests pass.

## Test plan

- Add a focused runner test only if the repository already has a script-test harness; otherwise verification through root commands is sufficient.
- Confirm an invalid task still exits nonzero and prints the supported task list.

## Done criteria

- [ ] No hardcoded `packages/opencode-...` directory list remains in `scripts/run-workspaces.ts`.
- [ ] Root `typecheck`, `check`, `test`, `test:package`, and `build` cover every workspace package.
- [ ] `bun run typecheck`, `bun run check`, `bun run test`, and `bun run test:package` pass.
- [ ] No files outside Scope are modified.
- [ ] `plans/README.md` marks plan 001 DONE.

## STOP conditions

- Workspace discovery requires a new dependency.
- The manifest cannot be read without changing package semantics.
- Existing package order or exit behavior cannot be preserved.

## Maintenance notes

The workspace glob is now the authority. Review future root scripts for newly duplicated package lists.
