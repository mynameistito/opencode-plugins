# Plan 004: Align contributor and installation documentation

> **Executor instructions**: Follow this plan step by step. Stop on any STOP condition and update `plans/README.md` when complete.
>
> **Drift check**: `git diff --stat 9643d54..HEAD -- README.md packages/opencode-usage-limits/README.md packages/opencode-usage-limits/AGENTS.md packages/opencode-force-input/README.md`.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/003-auth-config-diagnostics.md`
- **Category**: docs
- **Planned at**: commit `9643d54`, 2026-08-31

## Why this matters

The package agent instructions describe only Codex and ZAI even though six providers are implemented and documented. Installation examples also use inconsistent CLI names between root and package READMEs. Align the docs with the current package behavior and make the root README the concise index while package READMEs hold details.

## Current state

- `packages/opencode-usage-limits/AGENTS.md:5` says the plugin surfaces Codex and ZAI only.
- `packages/opencode-usage-limits/README.md:20-30` uses `opencode plugin` installation syntax.
- `README.md:7-17` uses `opencode2 plugin` syntax for the force-input package.
- `packages/opencode-usage-limits/README.md:151-160` is the authoritative provider table.

## Commands you will need

| Purpose                          | Command            | Expected           |
| -------------------------------- | ------------------ | ------------------ |
| Documentation consistency search | `rg "Codex and ZAI | opencode plugin    | opencode2 plugin | Supported providers" README.md packages` | only intentional/version-specific matches remain |
| Checks                           | `bun run check`    | no warnings/errors |
| Tests                            | `bun run test`     | all pass           |

## Scope

**In scope**

- `README.md`
- `packages/opencode-usage-limits/README.md`
- `packages/opencode-usage-limits/AGENTS.md`
- `packages/opencode-force-input/README.md` only if its command or version wording conflicts

**Out of scope**

- Source code and package metadata
- Historical changelogs
- New product features

## Steps

### Step 1: Establish the canonical command

Use the current root README and repository package/plugin conventions as the source of truth. If the installed CLI has a version-specific command, state that explicitly rather than presenting two unexplained commands. Keep code blocks runnable and preserve platform-specific notes.

**Verify**: Read every installation block and confirm package name, entrypoint, and CLI command agree.

### Step 2: Update provider and contributor facts

Change the package AGENTS overview to list all six supported providers or point directly to the provider table. Remove stale “Codex and ZAI” wording. Keep agent instructions concise and execution-oriented.

**Verify**: `rg "Codex and ZAI" packages README.md` -> no matches.

### Step 3: Check examples against schema

Compare documented config fields and provider names with `usage-limits.schema.json` and `examples/usage-limits.jsonc`; fix only documentation mismatches discovered during this check.

**Verify**: `bun run test:package` -> package smoke tests pass.

## Done criteria

- [ ] Provider list and package overview describe current behavior.
- [ ] Installation commands are consistent and version-specific caveats are explicit.
- [ ] No stale contributor guidance remains.
- [ ] `bun run check`, `bun run test`, and `bun run test:package` pass.
- [ ] No files outside Scope are modified.
- [ ] `plans/README.md` marks plan 004 DONE.

## STOP conditions

- Canonical CLI syntax cannot be established from repository evidence.
- Documentation would require changing package exports or published metadata.
- A README example contradicts the schema in a way that requires a product decision.

## Maintenance notes

When a provider or installation flow changes, update the package README, root index, and package AGENTS overview together.
