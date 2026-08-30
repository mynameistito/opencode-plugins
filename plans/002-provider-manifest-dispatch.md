# Plan 002: Dispatch providers from the canonical manifest

> **Executor instructions**: Follow this plan step by step. Stop on any STOP condition and update `plans/README.md` when complete.
>
> **Drift check**: `git diff --stat 9643d54..HEAD -- packages/opencode-usage-limits/src/providers.ts packages/opencode-usage-limits/src/providers/index.ts packages/opencode-usage-limits/__tests__/providers/index.test.ts`.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: `plans/001-workspace-manifest-runner.md`
- **Category**: tech-debt
- **Planned at**: commit `9643d54`, 2026-08-31

## Why this matters

Provider definitions are already centralized in `PROVIDER_MANIFEST`, but `src/providers.ts` imports every provider again and maintains a second six-branch dispatcher with repeated casts. Adding or renaming a provider requires synchronized edits in multiple places and weakens type safety. Make the manifest the single runtime registry while retaining typed public APIs and unknown-ID failure behavior.

## Current state

- `src/providers/index.ts:9-35` owns the ordered manifest and a separate lookup object.
- `src/providers.ts:3-12` repeats all provider imports.
- `src/providers.ts:39-91` switches on every provider ID and uses repeated `as Effect.Effect<...>` assertions.
- `__tests__/providers/index.test.ts` already tests manifest completeness and fetch dispatch.

## Commands you will need

| Purpose | Command | Expected |
| --- | --- | --- |
| Typecheck | `bun run typecheck` | exit 0 |
| Provider tests | `bun test packages/opencode-usage-limits/__tests__/providers/index.test.ts` | all pass |
| Full tests | `bun run test` | all pass |
| Checks | `bun run check` | no warnings/errors |

## Scope

**In scope**

- `packages/opencode-usage-limits/src/providers/index.ts`
- `packages/opencode-usage-limits/src/providers.ts`
- `packages/opencode-usage-limits/__tests__/providers/index.test.ts`

**Out of scope**

- Provider adapter parsing or network behavior
- Public provider IDs and config shapes
- UI behavior

## Steps

### Step 1: Expose a typed canonical lookup

Derive the lookup from `PROVIDER_MANIFEST` rather than spelling providers a second time. Preserve `PROVIDER_ORDER`, `PROVIDERS`, `defaultLabelFor`, and all exported behavior. If TypeScript cannot preserve the generic ID/config relationship through a direct lookup, isolate the single unavoidable boundary cast in one helper instead of repeating casts per provider.

**Verify**: `bun run typecheck` -> exit 0.

### Step 2: Replace the switch dispatcher

Implement `fetchProviderEffect` through the canonical definition lookup. Preserve the provider runtime environment requirement, exact arguments, and the thrown `unknown provider: ${id}` error for impossible/invalid IDs.

**Verify**: `bun test packages/opencode-usage-limits/__tests__/providers/index.test.ts` -> all dispatch tests pass.

### Step 3: Add a regression assertion for single registration

Extend the existing provider manifest test only as needed to ensure every manifest definition is dispatchable and no second provider list is required. Do not duplicate provider-specific response fixtures.

**Verify**: `bun run test` -> all package tests pass.

## Done criteria

- [ ] Provider imports and dispatch derive from the canonical manifest.
- [ ] Repeated per-provider casts and the six-branch switch are removed.
- [ ] Existing provider IDs, order, labels, and errors remain unchanged.
- [ ] `bun run typecheck`, `bun run check`, and `bun run test` pass.
- [ ] No files outside Scope are modified.
- [ ] `plans/README.md` marks plan 002 DONE.

## STOP conditions

- The refactor changes a public provider ID or config type.
- More than one broad `as` cast is required to make the registry compile.
- Existing provider tests reveal changed request or parsing behavior.

## Maintenance notes

Future providers should add one definition to the manifest and one adapter module, not another dispatcher branch.
