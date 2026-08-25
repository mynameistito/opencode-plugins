# Contributing

Contribute from a focused branch and target the monorepo `main` branch. Both packages currently contain OpenCode v2 code and are published from `main` under the `latest` dist-tag.

## Setup

```powershell
bun install --frozen-lockfile
bun run typecheck
```

Use the OpenCode v2 CLI when manually testing the plugin.

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

Changesets live at the repository root and releases are coordinated from `main` with npm `latest`. Never manually edit package versions.

## Pull Requests

Keep commits focused and run the full checks before opening a PR. Mention package-specific API or compatibility impact and the relevant checks.
