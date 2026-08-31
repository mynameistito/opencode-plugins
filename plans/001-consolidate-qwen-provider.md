# Plan 001: Consolidate the Qwen provider path

> **Executor instructions**: Follow every step and run each verification command. Update Plan 001 in `plans/README.md` when finished. Do not expose credentials or subprocess output in code, tests, commits, or PR text.
>
> **Drift check (run first)**: `git diff --stat a368bf0..HEAD -- packages/opencode-usage-limits/src/providers/qwen.ts packages/opencode-usage-limits/__tests__/providers/qwen.test.ts plans/README.md`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: none
- **Category**: tests, tech-debt
- **Planned at**: commit `a368bf0`, 2026-08-31

## Why This Matters

The shipped `qwenProvider.fetch` uses the Effect runtime command layer, while all Qwen tests exercise a second Promise implementation. The paths duplicate parsing and usage-window construction but classify command failures differently. Test the production path first, then remove the unexported legacy path so future Qwen work has one source of truth.

## Current State

- `packages/opencode-usage-limits/src/providers/qwen.ts` contains both adapters.
- `packages/opencode-usage-limits/__tests__/providers/qwen.test.ts` imports only `createQwenProvider`.
- The package export map exposes only `./tui`; `createQwenProvider` is not a documented package entrypoint.

`qwen.ts:233-247` production boundary:

```ts
const fetchQwenTokenPlanUsage = (config, _openCodeAuth, timeoutMs) =>
  Effect.gen(function* runFetchQwenTokenPlanUsage() {
    const commands = yield* ProviderCommandExecutor;
    const clock = yield* ProviderClock;
    const authRaw = yield* commands.execute({
      acceptedExitCodes: new Set([2]),
      args: ["auth", "status", "--format", "json"],
      command: DEFAULT_CLI,
      providerID: "qwen",
      timeoutMs,
    });
```

`qwen.ts:297-365` defines the duplicate `createQwenProvider` Promise adapter. Existing runtime-service tests use Effect layers; follow `__tests__/providers/runtime.test.ts:35-40` for `Effect.runPromise` and layer provisioning.

## Commands You Will Need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Typecheck | `bun run typecheck` | exit 0 |
| Qwen tests | `bun --filter @mynameistito/opencode-usage-limits test __tests__/providers/qwen.test.ts` | all tests pass |
| Full tests | `bun run test` | all tests pass |
| Lint | `bun run check` | exit 0 |

## Scope

**In scope**

- `packages/opencode-usage-limits/src/providers/qwen.ts`
- `packages/opencode-usage-limits/__tests__/providers/qwen.test.ts`
- `plans/README.md`

**Out of scope**

- Other provider adapters and runtime command behavior.
- Changes to Qwen CLI commands, authentication semantics, or user-visible error wording.
- New package exports.

## Git Workflow

- Branch: `advisor/001-consolidate-qwen-provider`
- Use conventional commits, for example `refactor: dispatch providers from manifest`.
- Do not push or open a PR unless separately instructed.

## Steps

### Step 1: Characterize the production Effect adapter

In `qwen.test.ts`, replace the Promise-runner harness with a `ProviderCommandExecutor` test layer that records command inputs and returns configured stdout or typed command failures. Provide that layer plus a deterministic `ProviderClock` layer to `qwenProvider.fetch`, then execute with `Effect.runPromise` or `Effect.runPromiseExit`.

Cover: successful authenticated usage, accepted exit code 2 with unauthenticated JSON, malformed auth/usage JSON, missing subscription, and command timeout/failure classification. Assert command arguments, provider ID, and timeout are preserved. Assert only safe typed provider errors; do not assert or construct secret-like subprocess output.

**Verify**: `bun --filter @mynameistito/opencode-usage-limits test __tests__/providers/qwen.test.ts` -> all Qwen tests pass against `qwenProvider.fetch`.

### Step 2: Delete the legacy adapter after coverage exists

Remove `QwenCommandError`, `safeCommandCause`, `commandError`, `QwenCommandRunner`, `QwenProviderDependencies`, and `createQwenProvider` from `qwen.ts`. Keep the parsing helpers and `qwenProvider` definition unchanged except for now-unused imports.

**Verify**: `rg "createQwenProvider|QwenCommandRunner|QwenProviderDependencies" packages/opencode-usage-limits` -> no matches.

### Step 3: Run repository gates

**Verify**: `bun run typecheck; bun run test; bun run check` -> all commands exit 0.

## Test Plan

- Use the injected production command layer to cover both CLI calls and the nonzero authentication status path.
- Verify malformed CLI output becomes `ProviderResponseDecodeError` without including raw output.
- Verify a fixed clock supplies `capturedAt`.
- Follow `__tests__/providers/runtime.test.ts` for Effect-layer test structure.

## Done Criteria

- [ ] Qwen tests invoke `qwenProvider.fetch`, not `createQwenProvider`.
- [ ] `rg "createQwenProvider|QwenCommandRunner|QwenProviderDependencies" packages/opencode-usage-limits` has no matches.
- [ ] `bun run typecheck`, `bun run test`, and `bun run check` exit 0.
- [ ] Only in-scope files changed.
- [ ] Plan 001 is marked DONE in `plans/README.md`.

## STOP Conditions

- Stop if an installed package consumer imports `createQwenProvider` through a supported export path.
- Stop if reproducing a legacy error contract requires changing production user-visible error text.
- Stop if the current runtime command layer cannot be replaced in tests without modifying an out-of-scope runtime file.

## Maintenance Notes

Future Qwen behavior must be tested through `qwenProvider.fetch` and injected `ProviderCommandExecutor`/`ProviderClock` layers. Reviewers should reject a second command-execution abstraction unless it is also the production boundary.
