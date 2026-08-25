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

Create Changesets at the root with `bun run changeset-add -- force-input|usage-limits patch|minor|major "summary"`.

## Testing

Tests belong in each package's `__tests__/` directory. Preserve package smoke tests because they verify published exports and runtime behavior.
