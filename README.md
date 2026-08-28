# OpenCode Plugins

Personal [OpenCode](https://opencode.ai) V2 plugins published from a Bun workspace.

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

### [`@mynameistito/opencode-share`](packages/opencode-share)

Shares an OpenCode session through a self-hosted Cloudflare Worker. The transcript is sanitized and encrypted in the TUI with AES-GCM before it leaves the machine. The Worker stores ciphertext in R2 and lifecycle metadata in D1; it never receives the encryption key or decrypts the transcript.

The plugin registers `/oshare`, a command-palette action, and `<leader>h`. OpenCode's built-in command owns `/share`. Install it with:

```powershell
opencode2 plugin add "@mynameistito/opencode-share@latest" -g
```

See the [plugin README](packages/opencode-share/README.md) for configuration and the [Worker README](packages/opencode-share-worker/README.md) for deployment.

### [`@mynameistito/opencode-share-worker`](packages/opencode-share-worker)

The independently deployable Worker for the share plugin. It serves the viewer at `/s/<id>`, encrypted payload reads at `GET /api/shares/:id`, authenticated creation at `POST /api/shares`, and authenticated deletion at `DELETE /api/shares/:id`.

## Session Sharing

The share URL has this shape:

```text
https://host/s/<share-id>#<base64url-encryption-key>
```

The fragment is not sent in HTTP requests, so the Worker and R2 never see the key. The browser fetches ciphertext by ID and decrypts it locally. Expired shares return `404` and scheduled cleanup removes both their D1 metadata and R2 object.

The current OpenCode V2 beta does not expose the documented `session.export` method or a clipboard API. The plugin uses the beta's typed `context.data.session.message.list()` fallback, sanitizes that data locally, and copies successful URLs through terminal OSC 52. This fallback should be replaced with `session.export` when the API is shipped.

## Local Development

Build the workspace and load the source entrypoints from `~/.config/opencode/cli.json`:

```jsonc
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": [
    "/path/to/opencode-plugins/packages/opencode-force-input/src/tui.tsx",
    "/path/to/opencode-plugins/packages/opencode-usage-limits/src/index.ts",
    "/path/to/opencode-plugins/packages/opencode-share/tui.tsx",
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
bun run changeset-add -- opencode-share minor "Describe the change"
```

Packages are independently publishable. Build output is generated during packaging and is not committed.
