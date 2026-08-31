# Plan 002: Share optional provider auth-file loading

> **Executor instructions**: Follow every step and run each verification command. Preserve credential lookup order and suppress only the same configured-auth-file errors currently suppressed. Update Plan 002 in `plans/README.md` when finished.
>
> **Drift check (run first)**: `git diff --stat a368bf0..HEAD -- packages/opencode-usage-limits/src/providers packages/opencode-usage-limits/__tests__/providers plans/README.md`

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `a368bf0`, 2026-08-31

## Why This Matters

ZAI, Synthetic, MiniMax, and OpenCode GO each repeat the same optional auth-path control flow. The copies differ only by provider ID and key extractor, so a policy change currently needs four edits. Extract the policy shell without trying to unify provider-specific credential formats or precedence.

## Current State

- `src/providers/zai-coding-plan.ts:182-201`, `synthetic.ts:166-188`, `minimax.ts:133-155`, and `opencode-go.ts:93-115` all return `undefined` without reading when no path exists, read JSON with `ProviderFileSystem`, call a local extractor with `ProviderEnvironment.credential`, and catch all causes to return `undefined`.
- `src/providers/runtime/filesystem.ts:47-59` owns bounded `readJson`; keep that service unchanged.

Representative current shape (`synthetic.ts:166-188`):

```ts
if (!authPath) return Effect.succeed<undefined>(globalThis.undefined);
return Effect.gen(function* loadSyntheticAuthPathKey() {
  const files = yield* ProviderFileSystem;
  const environment = yield* ProviderEnvironment;
  const auth = yield* files.readJson({
    path: authPath,
    providerID: "synthetic",
  });
  return isRecord(auth)
    ? keyFromSyntheticAuth(auth, environment.credential)
    : undefined;
}).pipe(
  Effect.catchCause(() => Effect.succeed<undefined>(globalThis.undefined))
);
```

## Commands You Will Need

| Purpose | Command | Expected on success |
| --- | --- | --- |
| Provider tests | `bun --filter @mynameistito/opencode-usage-limits test __tests__/providers` | all pass |
| Full tests | `bun run test` | all pass |
| Typecheck | `bun run typecheck` | exit 0 |
| Lint | `bun run check` | exit 0 |

## Scope

**In scope**

- A new focused helper under `packages/opencode-usage-limits/src/providers/`
- `zai-coding-plan.ts`, `synthetic.ts`, `minimax.ts`, `opencode-go.ts`
- Their existing tests under `__tests__/providers/`
- `plans/README.md`

**Out of scope**

- Codex default-auth discovery.
- Credential field names, precedence, auth headers, or error presentation.
- `ProviderFileSystem` implementation and auth file size limits.

## Git Workflow

- Branch: `advisor/002-share-provider-auth-file-loading`
- Use conventional commits.
- Do not push or open a PR unless separately instructed.

## Steps

### Step 1: Add a narrow shared helper

Create a provider-local helper such as `readOptionalAuthPathKey`. It must accept `authPath`, `providerID`, and a provider-local extractor callback. It must acquire `ProviderFileSystem` and `ProviderEnvironment`, pass `files.readJson({ path: authPath, providerID })` to the extractor only for record-shaped JSON, and preserve the existing catch-all fallback to `undefined`. Return the same Effect environment and `never` error type as the copied functions.

Do not move `keyFrom...` extractors or use a generic credential-field schema; they encode provider-specific formats.

**Verify**: `bun run typecheck` -> exit 0.

### Step 2: Replace the four copies

Replace each local `read*AuthPathKey` body with the helper while retaining each existing local extractor and provider ID. Remove imports made unused by the replacement. Use ordinary `undefined`, not `globalThis.undefined`, in new code.

**Verify**: `rg "Effect\.catchCause\(\(\) => Effect\.succeed<undefined>" packages/opencode-usage-limits/src/providers` -> one shared implementation only.

### Step 3: Characterize configured file fallback

Add focused tests using injected runtime layers for each affected provider: a valid configured auth file supplies the same key as before, and a missing/malformed configured file falls through to the next credential source. Follow each provider test's existing injected HTTP/runtime setup; do not touch live user auth paths.

**Verify**: `bun --filter @mynameistito/opencode-usage-limits test __tests__/providers` -> all pass.

### Step 4: Run full gates

**Verify**: `bun run test; bun run typecheck; bun run check` -> all commands exit 0.

## Done Criteria

- [ ] Exactly one implementation performs optional configured auth-file read and catch-all fallback.
- [ ] All four providers retain their existing key extractors and lookup order.
- [ ] Tests cover valid and failed configured auth-path behavior for every affected provider.
- [ ] `bun run test`, `bun run typecheck`, and `bun run check` exit 0.
- [ ] Only in-scope files changed and Plan 002 is marked DONE.

## STOP Conditions

- Stop if any provider intentionally surfaces configured-file errors rather than falling back.
- Stop if extraction callbacks need provider-specific runtime services beyond filesystem and environment.
- Stop if the proposed helper would need to alter credential precedence.

## Maintenance Notes

Keep extraction functions beside their providers; only the safe optional-file policy is shared. Review future provider additions for use of this helper rather than copied `read*AuthPathKey` functions.
