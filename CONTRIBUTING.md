# Contributing

## Branches

- `main` is stable OpenCode and publishes npm `@latest`.
- `v2` is OpenCode v2 and publishes prereleases under npm `@beta`.
- Target stable API changes at `main`; target v2 API or CLI changes at `v2`.
- Keep this v2 worktree based on `v2`; do not merge it into `main`.

## Setup

```powershell
bun install --frozen-lockfile
bun run typecheck
```

Use `@opencode-ai/cli@beta` and its `opencode2` binary when manually testing the v2 plugin.

## Checks

```powershell
bun run typecheck
bun run check
bun run test
bun run test:package
bun run build
bun run knip
```

Run `bun run fix` to apply Ultracite formatting and lint fixes. Do not change Oxlint, Oxfmt, or Ultracite configuration to bypass a failure.

## Changesets And Releases

Add a Changeset for every user-facing change:

```powershell
bun run changeset-add patch "describe the change"
```

The v2 branch keeps `.changeset/pre.json` in prerelease mode with the `beta` tag. Changesets create versions such as `0.2.0-beta.0` and increment them for subsequent beta releases. Never manually edit package versions or use the same Changeset independently on both branches.

Pushes to `main` create stable Changesets release work and publish with npm `latest`. Pushes to `v2` create beta release work and publish with npm `beta`; GitHub releases from that job are marked prereleases. Both workflows use npm provenance and immutable GitHub Action SHAs.

## Pull Requests

Keep commits focused and run the full checks before opening a PR. A v2 PR must target `v2` and explain API changes, beta release impact, tests, and any intentional difference from `main`.
