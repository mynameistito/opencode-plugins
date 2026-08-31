# Plan 006: Document Qwen footer and CLI requirements

> **Executor instructions**: Follow every step and run each verification command. Keep credential guidance generic; never include credential values. Update Plan 006 in `plans/README.md` when finished.
>
> **Drift check (run first)**: `git diff --stat a368bf0..HEAD -- packages/opencode-usage-limits/README.md packages/opencode-usage-limits/src/providers/qwen.ts plans/README.md`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/001-consolidate-qwen-provider.md`
- **Category**: docs
- **Planned at**: commit `a368bf0`, 2026-08-31

## Why This Matters

Qwen supports prompt-footer usage, but the top-level feature list omits it. The plugin also requires a locally installed and authenticated `qwencloud` CLI, while the README only calls it a data source. Correcting these statements gives users a clear setup and troubleshooting path.

## Current State

- `README.md:12` says Qwen usage comes from the local CLI.
- `README.md:14` lists footer providers but omits Qwen.
- `src/providers/qwen.ts:241-257` runs `qwencloud auth status --format json` before usage; `:257-261` treats unauthenticated state as missing credentials.
- `README.md:219-226` already maps OpenCode provider `qwen` to Qwen Token Plan usage.

## Commands You Will Need

| Purpose            | Command            | Expected on success |
| ------------------ | ------------------ | ------------------- |
| Documentation diff | `git diff --check` | exit 0              |
| Full tests         | `bun run test`     | all pass            |
| Lint               | `bun run check`    | exit 0              |

## Scope

**In scope**

- `packages/opencode-usage-limits/README.md`
- `plans/README.md`

**Out of scope**

- Qwen provider code and CLI invocation behavior.
- Installation commands for third-party Qwen software.
- Credentials, account-specific instructions, or secrets.

## Git Workflow

- Branch: `advisor/006-document-qwen-requirements`
- Use conventional commits.
- Do not push or open a PR unless separately instructed.

## Steps

### Step 1: Correct the feature summary

Add Qwen to the prompt-footer feature statement at README line 14. Match existing provider naming: "Qwen Token Plan" in prose and `qwen` for the OpenCode provider ID.

**Verify**: `rg "prompt-footer usage.*Qwen|Qwen.*prompt-footer" packages/opencode-usage-limits/README.md` -> one matching statement.

### Step 2: Add a concise Qwen prerequisite note

Near the provider table or troubleshooting section, state that Qwen usage requires the local `qwencloud` CLI to be installed and authenticated, because the plugin calls its authentication-status and usage commands. State that unauthenticated CLI state appears as missing credentials. Do not document authentication commands, tokens, or account details.

**Verify**: `rg "qwencloud.*authenticated|authenticated.*qwencloud" packages/opencode-usage-limits/README.md` -> one matching prerequisite statement.

### Step 3: Run gates

**Verify**: `git diff --check; bun run test; bun run check` -> all commands exit 0.

## Done Criteria

- [ ] The feature list accurately includes Qwen footer support.
- [ ] README states the installed, authenticated local CLI prerequisite without credential material.
- [ ] `git diff --check`, `bun run test`, and `bun run check` exit 0.
- [ ] Only in-scope files changed and Plan 006 is marked DONE.

## STOP Conditions

- Stop if Plan 001 changes the Qwen production CLI behavior or footer mapping.
- Stop if documentation would need unverified vendor-specific setup commands.

## Maintenance Notes

Keep the README feature list and provider mapping synchronized when adding a provider or changing its footer mapping. The README should document runtime prerequisites, not third-party credential procedures.
