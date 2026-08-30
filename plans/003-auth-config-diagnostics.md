# Plan 003: Preserve diagnostics for auth and config failures

> **Executor instructions**: Follow this plan step by step. Stop on any STOP condition and update `plans/README.md` when complete.
>
> **Drift check**: `git diff --stat 9643d54..HEAD -- packages/opencode-usage-limits/src/config.ts packages/opencode-usage-limits/src/coordinator.ts packages/opencode-usage-limits/__tests__/config.test.ts packages/opencode-usage-limits/__tests__/coordinator.test.ts`.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/002-provider-manifest-dispatch.md`
- **Category**: bug
- **Planned at**: commit `9643d54`, 2026-08-31

## Why this matters

The plugin intentionally avoids exposing credential contents, but currently collapses malformed or unreadable OpenCode auth into `{}` and config failures into defaults. Users cannot distinguish absent credentials from permission, filesystem, or format problems. Preserve safe classified diagnostics without logging secrets or response bodies.

## Current state

- `src/config.ts:64-70` catches every auth-loading failure and returns `{}`.
- `src/coordinator.ts:114-123` converts non-interruption config failures to `DEFAULT_CONFIG`.
- Existing errors are classified in `src/errors.ts` and tested in `__tests__/errors.test.ts`.
- Tests use redaction assertions in `__tests__/config.test.ts`; follow that pattern.

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| Typecheck | `bun run typecheck` | exit 0 |
| Config tests | `bun test packages/opencode-usage-limits/__tests__/config.test.ts` | all pass |
| Coordinator tests | `bun test packages/opencode-usage-limits/__tests__/coordinator.test.ts` | all pass |
| Full checks | `bun run check && bun run test` | pass |

## Scope

**In scope**

- `packages/opencode-usage-limits/src/config.ts`
- `packages/opencode-usage-limits/src/coordinator.ts`
- Relevant config/coordinator tests under `packages/opencode-usage-limits/__tests__/`
- One root `.changeset/*.md` patch file for `@mynameistito/opencode-usage-limits`

**Out of scope**

- Credential values or logging their contents
- Provider API errors
- Changes to public config schema

## Steps

### Step 1: Define safe diagnostic behavior

Use existing typed error categories or add the smallest safe error shape needed. Preserve the current fallback behavior so the TUI keeps running, but retain enough classification for tests and a concise user-facing diagnostic path. Never include file contents, API keys, response bodies, or raw subprocess output.

**Verify**: `bun run typecheck` -> exit 0.

### Step 2: Cover auth failure classes

Add tests for absent auth, malformed auth, and unreadable/read failure behavior. Assert only error category/message shape, never secret values. Keep valid recognized auth fields working when unrelated fields are malformed.

**Verify**: `bun test packages/opencode-usage-limits/__tests__/config.test.ts` -> all pass.

### Step 3: Cover coordinator continuity

Add or update coordinator tests proving a diagnostic config/auth failure does not terminate refreshes or prevent later successful refreshes. Preserve interruption propagation.

**Verify**: `bun test packages/opencode-usage-limits/__tests__/coordinator.test.ts` -> all pass.

### Step 4: Add the changeset

Create a patch changeset using `bun run changeset-add -- usage-limits patch "Preserve safe diagnostics for configuration and authentication failures"` only if the behavior is visible to users. If the final implementation remains entirely internal and behaviorally identical, omit it and record why in the PR.

**Verify**: `git diff -- .changeset` shows one correctly formatted usage-limits patch changeset or the PR notes explicitly justify omission.

## Done criteria

- [ ] Auth/config failures remain classified without secret leakage.
- [ ] Refresh continues after recoverable loader failures.
- [ ] Tests cover absent, malformed, and unreadable inputs.
- [ ] `bun run typecheck`, `bun run check`, and `bun run test` pass.
- [ ] Changeset decision is recorded.
- [ ] No files outside Scope are modified.
- [ ] `plans/README.md` marks plan 003 DONE.

## STOP conditions

- Safe diagnostics require exposing a credential, response body, or raw filesystem output.
- The change would make malformed config fatal to plugin startup.
- Existing error types cannot represent the distinction without redesigning public APIs.

## Maintenance notes

Review all future catch blocks around credential loading for the same “safe but actionable” balance.
