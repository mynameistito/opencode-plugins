# Plan 005: Pin analysis and release executables

> **Executor instructions**: Follow every step and run each verification command. Choose only reviewed versions; do not substitute a moving `latest` tag. Update Plan 005 in `plans/README.md` when finished.
>
> **Drift check (run first)**: `git diff --stat a368bf0..HEAD -- package.json bun.lock packages/*/package.json .github/workflows/release.yml plans/README.md`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security, dx
- **Planned at**: commit `a368bf0`, 2026-08-31

## Why This Matters

CI runs `bunx knip@latest`, and the privileged release workflow installs `npm@latest`. A repository commit therefore does not fully determine the executables that analyze code or publish packages. Pin reviewed versions and let Bun lock the Knip dependency.

## Current State

- Root `package.json:14` and both package manifests run `bunx knip@latest`.
- CI runs `bun run knip` after `bun install --frozen-lockfile` in `.github/workflows/ci.yml:36-39`.
- `.github/workflows/release.yml:34-46` installs `npm@latest` then requires npm `>= 11.15.0` for staged publishing.

## Commands You Will Need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Install locked dependency | `bun add --dev --exact knip@<reviewed-version>` | `package.json` and `bun.lock` updated |
| Static analysis | `bun run knip` | exit 0 |
| Full tests | `bun run test` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run check` | exit 0 |

## Scope

**In scope**

- Root `package.json` and `bun.lock`
- `packages/opencode-force-input/package.json`
- `packages/opencode-usage-limits/package.json`
- `.github/workflows/release.yml`
- `plans/README.md`

**Out of scope**

- Upgrading OpenCode, Effect, Bun, or GitHub Actions.
- Changing release permissions or publication logic.

## Git Workflow

- Branch: `advisor/005-pin-analysis-release-executables`
- Use conventional commits.
- Do not push or open a PR unless separately instructed.

## Steps

### Step 1: Obtain an approved Knip version

Use a version explicitly approved by the maintainer or already validated in a reviewed dependency update. Replace `<reviewed-version>` in the install command with that exact version. If no version is approved, stop rather than fetching `latest` as part of this task.

**Verify**: `bun pm ls knip` -> reports the exact selected version.

### Step 2: Use the lockfile-managed binary

Add Knip as an exact root dev dependency. Replace all three `bunx knip@latest` scripts with `knip`, so Bun resolves the locked workspace binary. Keep the package scripts because package-local contributors may invoke them.

**Verify**: `rg "knip@latest|bunx knip" package.json packages` -> no matches.

### Step 3: Pin the release npm version

Replace `npm install --global npm@latest` with exact `npm@11.15.0`, the minimum version already accepted by the workflow check. Keep the existing version capability check as defense against runner/environment drift.

**Verify**: `rg "npm@latest" .github` -> no matches.

### Step 4: Run gates

Run the listed analysis, test, typecheck, and lint commands.

**Verify**: all four commands exit 0.

## Done Criteria

- [ ] Knip is an exact root dev dependency recorded in `bun.lock`.
- [ ] No script uses `bunx knip@latest`.
- [ ] Release workflow installs exact `npm@11.15.0` and retains its minimum-version check.
- [ ] `bun run knip`, `bun run test`, `bun run typecheck`, and `bun run check` exit 0.
- [ ] Only in-scope files changed and Plan 005 is marked DONE.

## STOP Conditions

- Stop if no approved Knip version is available.
- Stop if exact Knip produces new findings that need configuration or source changes outside scope.
- Stop if npm 11.15.0 cannot run the existing staged publication workflow check.

## Maintenance Notes

Update Knip intentionally through dependency review. Keep the release workflow's explicit npm minimum check when the pinned version changes, because staged publishing remains a hard requirement.
