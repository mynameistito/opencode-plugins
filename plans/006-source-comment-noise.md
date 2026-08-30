# Plan 006: Remove redundant source documentation noise

> **Executor instructions**: Follow this plan step by step. Stop on any STOP condition and update `plans/README.md` when complete.
>
> **Drift check**: `git diff --stat 9643d54..HEAD -- packages/opencode-usage-limits/src/session.ts packages/opencode-usage-limits/src/providers.ts packages/opencode-usage-limits/src/components.tsx packages/opencode-force-input/src/index.ts`.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/005-ci-install-efficiency.md`
- **Category**: tech-debt
- **Planned at**: commit `9643d54`, 2026-08-31

## Why this matters

Several small, private helpers and straightforward render functions carry verbose JSDoc that repeats their names, parameters, or return types. This makes the source harder to scan and creates maintenance burden when behavior changes. Remove only redundant prose while keeping comments that explain compatibility boundaries, security constraints, non-obvious fallbacks, or public APIs.

## Current state

- `packages/opencode-usage-limits/src/session.ts:17-60` contains long descriptions for simple extraction helpers.
- `src/providers.ts:21-32,107-115` documents straightforward internal dispatch/config helpers.
- `src/components.tsx:21-27,157-164` contains explanatory blocks where the code and types already state the behavior.
- `packages/opencode-force-input/src/index.ts` has concise comments that may still be useful for plugin identifiers and terminal compatibility.

## Commands you will need

| Purpose           | Command             | Expected           |
| ----------------- | ------------------- | ------------------ |
| Formatting/checks | `bun run check`     | no warnings/errors |
| Typecheck         | `bun run typecheck` | exit 0             |
| Tests             | `bun run test`      | all pass           |

## Scope

**In scope**

- `packages/opencode-usage-limits/src/session.ts`
- `packages/opencode-usage-limits/src/providers.ts`
- `packages/opencode-usage-limits/src/components.tsx`
- `packages/opencode-force-input/src/index.ts` only where a comment is clearly redundant

**Out of scope**

- Logic, names, exports, types, or JSX structure
- Public package README/API docs
- New comments explaining obvious assignments

## Steps

### Step 1: Remove redundant blocks

Delete or shorten comments that merely restate a function name/signature. Keep comments explaining OpenCode v2/legacy theme compatibility, safety/redaction boundaries, provider fallback semantics, or terminal-specific behavior. Do not replace removed comments with new prose.

**Verify**: `bun run check` -> no warnings/errors.

### Step 2: Confirm behavior is unchanged

Review the diff to ensure it contains comment-only changes and no formatting-induced logic edits.

**Verify**: `git diff --word-diff=porcelain -- packages/opencode-usage-limits/src/session.ts packages/opencode-usage-limits/src/providers.ts packages/opencode-usage-limits/src/components.tsx packages/opencode-force-input/src/index.ts` -> only comment/whitespace changes.

## Done criteria

- [ ] Redundant private-function JSDoc is removed or concise.
- [ ] Compatibility, safety, and non-obvious behavior comments remain.
- [ ] Diff contains no logic or API changes.
- [ ] `bun run check`, `bun run typecheck`, and `bun run test` pass.
- [ ] No changeset is added.
- [ ] `plans/README.md` marks plan 006 DONE.

## STOP conditions

- Removing a comment would erase a security, compatibility, or lifecycle invariant.
- The formatter changes executable code beyond whitespace.
- The diff contains non-comment behavior changes.

## Maintenance notes

Prefer comments that explain why a future maintainer must not simplify code, not comments that paraphrase what the code already says.
