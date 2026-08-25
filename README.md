# OpenCode Plugins

OpenCode TUI plugins maintained as a Bun workspace.

## Packages

- [`@mynameistito/opencode-force-input`](packages/opencode-force-input) adds force-submit bindings for OpenCode v2.
- [`@mynameistito/opencode-usage-limits`](packages/opencode-usage-limits) displays provider usage limits in the TUI.

Both packages currently contain OpenCode v2 code and are released from `main` using npm's `latest` dist-tag.

## Development

```powershell
bun install --frozen-lockfile
bun run typecheck
bun run check
bun run test
bun run build
```

Use the root Changesets helper for user-facing changes:

```powershell
bun run changeset-add -- force-input patch "Describe the change"
bun run changeset-add -- usage-limits minor "Describe the change"
```

Packages remain independently publishable. Build output is generated during packaging and is not committed.
