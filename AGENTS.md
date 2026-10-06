# Agent Instructions

## Workspace

- Use Bun for installation and scripts.
- Packages live under `packages/`.
- Shared development tooling and configuration live at the repository root.
- Runtime and peer dependencies remain in the package that publishes them.

## Commands

- `bun install --frozen-lockfile`
- `bun run typecheck`
- `bun run check`
- `bun run test`
- `bun run build`
- `bun run test:package`
- `bun run knip`

## Changesets

Create Changesets at the root with `bun run changeset-add <docs|force-input|usage-limits> <patch|minor|major> "summary"`. Meaningful plugin changes and documentation-site content changes require a matching Changeset. Tests, package-local scripts, and listed development-only metadata/configuration changes are exempt. Apply `skip-changeset` only for a justified non-release change and with maintainer agreement.

## Pull request automation

PR metadata automation labels changed components from file paths and package names in changed Changesets, and reconciles size labels on every update. Documentation link checks run for relevant edits and weekly. Workflow security scans run when Actions or Dependabot configuration changes.

## Testing

Tests belong in each package's `__tests__/` directory. Preserve package smoke tests because they verify published exports and runtime behavior.
