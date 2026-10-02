## Related issue

<!-- Use `Closes #123` when this PR resolves an issue, or `Refs #123` when related. -->

## Summary

<!-- Describe the user-facing or repository change and why it is needed. -->

## OpenCode and plugin compatibility

<!-- For runtime/plugin changes, state the OpenCode V2 CLI version tested and the affected plugin package(s) and versions. -->

- OpenCode V2 CLI (`opencode2 --version`):
- Plugin package(s) and version(s):
- Compatibility or migration notes:

<!-- For docs-only or tooling-only changes, write "Not applicable". -->

## Validation

<!-- List the commands run and any manual checks, including OpenCode/plugin versions when relevant. -->

- [ ] `bun install --frozen-lockfile` (when dependencies changed)
- [ ] `bun run typecheck` (when TypeScript changed)
- [ ] `bun run check`
- [ ] `bun run test` (when behavior changed)
- [ ] `bun run build` (when package/build files changed)
- [ ] `bun run test:package` (when package exports or packaging changed)
- [ ] Documentation and examples match OpenCode V2 and the published plugin packages.

## Release

- [ ] A root Changeset is included when the change affects a published package.
- [ ] If a package change intentionally needs no release, the `skip-changeset` label is applied with maintainer agreement.
- [ ] No package-specific release workflow or prerelease metadata was added.
