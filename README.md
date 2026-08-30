# OpenCode Plugins

Personal TUI plugins for [OpenCode](https://opencode.ai) `V2` ([`@opencode-ai/cli`](https://www.npmjs.com/package/@opencode-ai/cli)).

## Packages

### [`@mynameistito/opencode-force-input`](packages/opencode-force-input)

Interrupts the active run and force-submits the current prompt with `Ctrl+Enter`.

Install it with OpenCode's plugin command:

```powershell
opencode2 plugin add "@mynameistito/opencode-force-input@latest" -g
```

See the [force-input README](packages/opencode-force-input/README.md) for manual configuration and Windows Terminal key bindings.

### [`@mynameistito/opencode-usage-limits`](packages/opencode-usage-limits)

Shows provider usage limits in the sidebar and prompt footer.

Supported providers:

- [ChatGPT](https://chatgpt.com/)
- [OpenCode GO](https://opencode.ai/go)
- [MiniMax Token Plan](https://www.minimax.ai/)
- [Synthetic](https://synthetic.ai/)
- [Qwen](https://qwen.ai/)
- [ZAI Coding Plan](https://zai.ai/)

Install it with:

```bash
opencode2 plugin add @mynameistito/opencode-usage-limits@latest -g
```

See the [usage-limits README](packages/opencode-usage-limits/README.md) for provider credentials, configuration, and troubleshooting.

## Local Development

Build the workspace and load the source entrypoints from `~/.config/opencode/cli.json`:

```jsonc
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": [
    "/path/to/opencode-plugins/packages/opencode-force-input/src/index.ts",
    "/path/to/opencode-plugins/packages/opencode-usage-limits/src/index.ts",
  ],
}
```

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

Packages are independently publishable. Build output is generated during packaging and is not committed.
