# Repository scripts

This directory contains shared repository utilities. Bun's native workspace filters run package scripts across the workspace. GitHub configuration, workflows, and workflow-specific scripts are documented in [`.github/README.md`](../.github/README.md).

## Shared scripts

| Script | Purpose | Used by |
| --- | --- | --- |
| [`changeset-add.ts`](changeset-add.ts) | Creates a Changeset for one of the supported packages. | `bun run changeset-add <package> <patch | minor | major> "summary"` |
| [`check-coverage.ts`](check-coverage.ts) | Checks an LCOV report against a minimum coverage threshold. | Package `test` scripts |

### Shared script helpers

| Script | Purpose | Used by |
| --- | --- | --- |
| [`json-value.ts`](shared/json-value.ts) | Parses JSON values using Node's built-in assertions and typed projections. | GitHub API and npm response parsing |
| [`node-executable.ts`](shared/node-executable.ts) | Resolves the explicit Node executable used for child-process invocation. | npm and Changesets CLI helpers |
| [`npm-cli.ts`](shared/npm-cli.ts) | Resolves the npm CLI bundled with the active Node installation. | Package tarball validation and release staging |

### Package tarball checks

| Script | Purpose | Used by |
| --- | --- | --- |
| [`check.ts`](package-tarball/check.ts) | Verifies the contents of a packed package tarball. | Package smoke tests via `test-package.ts` |
| [`package-tarball-helpers.ts`](package-tarball/package-tarball-helpers.ts) | Shared path-validation helpers for package tarball checks. | Root unit tests and package smoke tests |
