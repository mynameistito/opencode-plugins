# Plan 005: Reduce redundant CI dependency installation

> **Executor instructions**: Follow this plan step by step. Stop on any STOP condition and update `plans/README.md` when complete.
>
> **Drift check**: `git diff --stat 9643d54..HEAD -- .github/workflows/ci.yml`.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/004-documentation-alignment.md`
- **Category**: perf
- **Planned at**: commit `9643d54`, 2026-08-31

## Why this matters

The CI matrix runs six independent jobs, and each job repeats checkout, Bun setup, and a full frozen install. This is reliable but wastes time and registry work. Add dependency caching and preserve independent task failure visibility without changing the verification commands.

## Current state

- `.github/workflows/ci.yml:16-25` defines six matrix tasks.
- `.github/workflows/ci.yml:27-38` installs dependencies separately in every matrix job.
- Bun version is pinned to `1.4.0` in CI and package manager metadata.

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| YAML inspection | `git diff --check` | no whitespace errors |
| Local baseline | `bun run typecheck && bun run check && bun run test` | all pass |
| Workflow validation | Use the repository's available actionlint/YAML validation tool if installed | no workflow errors |

## Scope

**In scope**

- `.github/workflows/ci.yml`

**Out of scope**

- Release workflow
- Task names or test commands
- Package dependency versions

## Steps

### Step 1: Add safe Bun dependency caching

Use the setup action's supported cache mechanism or an explicit cache keyed by the Bun lockfile and OS. Ensure cache misses still run `bun install --frozen-lockfile`, and avoid caching generated build output as dependencies.

**Verify**: `git diff --check` -> no errors; inspect the workflow to confirm the lockfile participates in the cache key.

### Step 2: Preserve matrix semantics

Do not collapse tasks into one shell command. Keep `fail-fast: false`, all six task names, pinned action SHAs, permissions, and frozen installs. If a cache option is unsupported by the pinned action, stop rather than changing action versions opportunistically.

**Verify**: `bun run typecheck && bun run check && bun run test` -> all pass locally.

## Done criteria

- [ ] CI cache is keyed by OS/Bun version/lockfile and is safe on cache miss.
- [ ] Six matrix tasks and failure isolation remain unchanged.
- [ ] No package or release workflow changes.
- [ ] Workflow diff passes whitespace/YAML validation.
- [ ] No changeset is added.
- [ ] `plans/README.md` marks plan 005 DONE.

## STOP conditions

- The pinned Bun setup action does not support the proposed cache path.
- Caching requires mutable or untrusted generated output.
- The change requires altering permissions or release automation.

## Maintenance notes

Any Bun upgrade must update both the workflow cache key inputs and `packageManager` metadata together.
