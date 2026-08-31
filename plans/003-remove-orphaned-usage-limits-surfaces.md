# Plan 003: Remove orphaned usage-limits surfaces

> **Executor instructions**: Follow every step and run each verification command. Confirm every target is unreferenced in live source before deletion. Update Plan 003 in `plans/README.md` when finished.
>
> **Drift check (run first)**: `git diff --stat a368bf0..HEAD -- packages/opencode-usage-limits/src packages/opencode-usage-limits/__tests__ plans/README.md`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `a368bf0`, 2026-08-31

## Why This Matters

Several source surfaces exist only to support their own tests or are declared but never read. They make the provider registry appear more configurable than runtime code actually is. Removing them reduces maintenance and makes supported behavior easier to identify.

## Current State

- `src/components.tsx:317-360` exports `CompactStatusLine`; only `__tests__/components.test.tsx` imports it.
- `src/utils.ts:233-289` exports `resolveEnvReference` and `fetchJson`; only `__tests__/utils.test.ts` imports them. Production provider transport uses `ProviderHttpClient` in `src/providers/runtime/http.ts` instead.
- `src/providers/definition.ts:19-36` requires `capabilities` and `configSchema`; `rg` finds these only in provider object literals, never consumed by the registry or runtime.

## Commands You Will Need

| Purpose        | Command                | Expected on success |
| -------------- | ---------------------- | ------------------- |
| Reference scan | `rg "CompactStatusLine | resolveEnvReference | fetchJson | capabilities: | configSchema:" packages/opencode-usage-limits` | only expected pre-change references |
| Tests          | `bun run test`         | all pass            |
| Typecheck      | `bun run typecheck`    | exit 0              |
| Lint           | `bun run check`        | exit 0              |

## Scope

**In scope**

- `components.tsx` and `__tests__/components.test.tsx`
- `utils.ts` and `__tests__/utils.test.ts`
- `providers/definition.ts` and the six provider definition files
- `plans/README.md`

**Out of scope**

- Used shared utilities such as JSONC parsing and `isRecord`.
- Provider config schemas in `config-schema.ts`; they remain the runtime decoder source of truth.
- Any package export-map change.

## Git Workflow

- Branch: `advisor/003-remove-orphaned-usage-limits-surfaces`
- Use conventional commits.
- Do not push or open a PR unless separately instructed.

## Steps

### Step 1: Reconfirm reachability

Run the reference scan above and inspect every result. Confirm no production module imports the three target exports and no code reads `ProviderDefinition.capabilities` or `.configSchema`.

**Verify**: each target has no live production consumer outside its declaration and test.

### Step 2: Delete orphaned UI and utilities with their tests

Remove `CompactStatusLine` and its test block. Remove `resolveEnvReference`, `fetchJson`, and their tests/imports. Retain nearby utility functions used by config loading, runtime services, or providers.

**Verify**: `rg "CompactStatusLine|resolveEnvReference|fetchJson" packages/opencode-usage-limits` -> no matches.

### Step 3: Reduce provider-definition metadata

Remove the `ProviderCapabilities` interface and `capabilities`/`configSchema` fields from `ProviderDefinition`. Remove corresponding fields and now-unused config-schema imports from Codex, ZAI, Synthetic, MiniMax, Qwen, and OpenCode GO provider definitions. Do not remove schema declarations from `config-schema.ts`.

**Verify**: `rg "capabilities:|configSchema:" packages/opencode-usage-limits/src/providers` -> no matches.

### Step 4: Run full gates

**Verify**: `bun run typecheck; bun run test; bun run check` -> all commands exit 0.

## Done Criteria

- [ ] The three orphaned exports and their tests are absent.
- [ ] Provider definitions contain only metadata consumed by the registry/runtime.
- [ ] Runtime config parsing remains unchanged.
- [ ] `bun run typecheck`, `bun run test`, and `bun run check` exit 0.
- [ ] Only in-scope files changed and Plan 003 is marked DONE.

## STOP Conditions

- Stop if a supported package export or consumer reaches any proposed deletion.
- Stop if `configSchema` is used by generation or reflection not visible to static search.
- Stop if removing a utility changes config loading or runtime HTTP behavior.

## Maintenance Notes

The provider definition should remain a runtime dispatch contract, not a speculative metadata catalog. Add metadata back only with a named consumer and direct tests.
