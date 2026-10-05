# @mynameistito/opencode-usage-limits

OpenCode TUI plugin that shows Codex, DeepSeek, Novita AI, OpenRouter, Command Code, OpenCode GO, ZAI, Synthetic, MiniMax Token Plan, Qwen, and Alibaba Token Plan usage limits in the sidebar and prompt footer.

## Features

- Adds a `Usage Limits` block under the sidebar `Context` section.
- Shows current Codex usage windows from OpenAI/Codex auth.
- Shows current DeepSeek currency balances from the official balance API.
- Shows the current available Novita AI API balance from its official billing API.
- Shows the OpenRouter API-key spending limit, not the total account balance.
- Shows current ZAI quota windows from ZAI Coding Plan auth.
- Shows current Synthetic rolling 5-hour and weekly windows.
- Shows current MiniMax Token Plan rolling 5-hour and weekly windows.
- Shows current Qwen Token Plan windows from the local `qwencloud` CLI.
- Shows current Alibaba Token Plan 5-hour and weekly windows from the local `bl` CLI.
- Shows current OpenCode GO rolling, weekly, and monthly windows.
- Displays current Command Code 5-hour, weekly, and derived monthly credit usage.
- Adds compact prompt-footer usage when the current session uses an OpenAI, DeepSeek, Novita AI, OpenRouter, Command Code, OpenCode GO, ZAI Coding Plan, Synthetic, MiniMax Token Plan, or Qwen Token Plan model.
- Providers are toggled from `~/.config/opencode/usage-limits.jsonc`.
- Reads OpenCode-connected credentials first, then falls back to explicit config/env credentials.

## Install

This package contains the OpenCode v2 TUI plugin and is published from the monorepo `main` branch using npm's `latest` dist-tag. Install it globally with:

```bash
opencode2 plugin add @mynameistito/opencode-usage-limits@latest -g
```

- `-g` / `--global` installs to `~/.config/opencode/cli.json`.
- Without `-g`, installs locally to `<project>/.opencode/cli.json` (requires a git worktree).
- `--force` replaces an existing pinned version.

The CLI installs the `latest` package and updates the TUI plugin config for you. The package entrypoint is `@mynameistito/opencode-usage-limits/tui`.

To configure it manually instead, add the plugin to `~/.config/opencode/cli.json`:

```jsonc
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": ["@mynameistito/opencode-usage-limits"],
}
```

OpenCode CLI/TUI plugins are configured in `cli.json`.

Restart OpenCode after changing TUI plugin config.

### Published package contents

- `@mynameistito/opencode-usage-limits/tui` is the TUI plugin entrypoint.
- `@mynameistito/opencode-usage-limits/schema` is the JSON schema for the usage-limits configuration.
- `examples/usage-limits.jsonc` is a complete, annotated configuration example.

### Troubleshooting

#### Reinstall or refresh the cached plugin

If the plugin is stale, broken, or needs a clean reinstall, quit OpenCode and remove the cache for the lane you installed. OpenCode caches immutable package versions, so clearing the cache is required when a `cli.json` entry still resolves to an older version.

For standard OpenCode (`@latest`), clear the cached package using the command for your shell:

PowerShell:

```powershell
Remove-Item -LiteralPath "$HOME\.cache\opencode\packages\@mynameistito\opencode-usage-limits@latest" -Recurse -Force
```

macOS/Linux:

```bash
rm -rf ~/.cache/opencode/packages/@mynameistito/opencode-usage-limits@latest
```

Start OpenCode again and it will reinstall the plugin from the existing `cli.json` entry. If the plugin is no longer configured, run the install command again:

```bash
opencode2 plugin add @mynameistito/opencode-usage-limits -g
```

- **Dependency conflicts involving `@opencode/plugin`** usually mean OpenCode's package cache contains an older plugin API package. Update OpenCode, clear the cached plugin as above, then retry the install. This package does not publish OpenCode runtime packages as peer dependencies.
- **`No versions available`** right after a release means a supply-chain cooldown policy (e.g. `min-release-age`) is blocking the fresh version. Wait for the cooldown window to pass, or install a previously vetted version instead.

## Releases

Both packages release from the monorepo `main` branch using normal root Changesets and npm's `latest` dist-tag. The package entrypoint is `@mynameistito/opencode-usage-limits/tui`.

## Usage Config

Create `~/.config/opencode/usage-limits.jsonc` from the complete [`examples/usage-limits.jsonc`](examples/usage-limits.jsonc) example. It includes every top-level, provider-common, and provider-specific option.

### Minimal config

For example, enable Codex, ZAI, and Command Code with auto-discovered credentials:

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/mynameistito/opencode-plugins/main/packages/opencode-usage-limits/usage-limits.schema.json",
  "providers": {
    "codex": { "enabled": true },
    "zai": { "enabled": true, "authorizationScheme": "raw" },
    "commandcode": { "enabled": true },
  },
}
```

Disabled providers are hidden:

```jsonc
"providers": {
  "codex": { "enabled": true },
  "zai": { "enabled": false }
}
```

Top-level `enabled` is the plugin master switch, and `showErrors` controls error text globally. Each provider's `enabled` controls fetching. Provider `showSidebarBar` and `showFooterBar` independently control its sidebar and footer displays without stopping refreshes; both default to `true`.

Each provider's `sidebarWindow` can be `all`, `rolling`, `daily`, `weekly`, `monthly`, `credits`, or `other`. Rolling includes legacy `5h` labels. Each provider accepts `footerWindow` with `auto` (the provider's normal selection), or one of the same window kinds. An unavailable requested footer window falls back to the provider's automatic selection and then its first available window.

## Providers

### Alibaba Token Plan (Personal/Solo)

Enable `alibaba-token-plan` to read the real 5-hour and weekly quota windows through the official [Bailian CLI](https://github.com/modelstudioai/cli). This is separate from the existing `qwen` / `qwencloud` integration and from the older Alibaba Coding Plan. Team credit balances are not supported by this adapter.

Install Bailian CLI following its upstream instructions, then authenticate once:

```sh
bl auth login --console --console-site international
bl usage token-plan --console-region ap-southeast-1 --console-site international --output json
```

The CLI owns authentication; the plugin neither imports browser cookies nor stores credentials. Initial console login may open a browser, but refreshes use the API through `bl`. An OpenCode model API key alone is insufficient. `bl` must be on the PATH inherited by OpenCode. Command failures (including a missing CLI or expired login) use the plugin's normal error/stale-data display.

Add to `~/.config/opencode/usage-limits.jsonc`:

```jsonc
{
  "providers": {
    "alibaba-token-plan": {
      "enabled": true,
      "region": "international",
      "showSidebarBar": true,
      "showFooterBar": true,
    },
  },
}
```

For mainland China, use `region: "china"` and log in with `bl auth login --console --console-site domestic`. The adapter selects `cn-beijing` / `domestic`; the default is `ap-southeast-1` / `international`. Footer aliases are `alibaba`, `alibaba-cn`, and `alibaba-token-plan`. Missing quota windows are omitted rather than displayed as zero or unlimited; an entirely empty response is treated as unavailable, preserving last-good data.

The response contract follows the official CLI's [`usage/token-plan.ts`](https://github.com/modelstudioai/cli/blob/main/packages/commands/src/commands/usage/token-plan.ts): `per5HourPercentage` and `per1WeekPercentage` are fractions from 0 to 1, and reset timestamps are Unix milliseconds.

| Provider ID | Service | Env var | Auth header | Default base URL |
| --- | --- | --- | --- | --- |
| `codex` | ChatGPT Codex usage | — | Bearer | `https://chatgpt.com/backend-api` |
| `deepseek` | DeepSeek balances | `DEEPSEEK_API_KEY` | Bearer | `https://api.deepseek.com` |
| `novita-ai` | Novita AI available API balance (USD) | `NOVITA_API_KEY` | Bearer | `https://api.novita.ai` |
| `openrouter` | OpenRouter API-key spending limit (USD) | `OPENROUTER_API_KEY` | Bearer | `https://openrouter.ai` |
| `zai` | Z.AI Coding Plan quota | `OC_ZAI_API_KEY` | raw / Bearer | `https://api.z.ai` |
| `synthetic` | Synthetic quotas | `OC_SYNTHETIC_API_KEY` | Bearer | `https://api.synthetic.new` |
| `minimax` | MiniMax Token Plan | `OC_MINIMAX_TOKEN_PLAN_KEY` | Bearer | `https://www.minimax.io` |
| `qwen` | Qwen Token Plan | `qwencloud` CLI | CLI | — |
| `alibaba-token-plan` | Alibaba Token Plan | — | CLI | — |
| `opencode-go` | OpenCode GO usage | `OPENCODE_API_KEY` | Bearer | `https://opencode.ai/zen/go/v1` |
| `commandcode` | Command Code credits | — | Bearer | `https://api.commandcode.ai` |

Qwen usage requires the local `qwencloud` CLI to be installed and authenticated because the plugin calls its authentication-status and usage commands; an unauthenticated CLI state appears as missing credentials.

Synthetic always uses `Bearer` auth and ignores `authorizationScheme`.

DeepSeek reads `GET https://api.deepseek.com/user/balance`. Each reported currency is displayed as an independent `credits` balance using `total_balance`; the component balances are not summed. OpenCode auth is used only for the exact official DeepSeek origin. A custom `baseUrl` requires an explicit `authPath` or `apiKey`, including `{env:DEEPSEEK_API_KEY}`.

Novita AI reads `GET https://api.novita.ai/openapi/v1/billing/balance/detail` and displays `availableBalance` as the remaining USD balance. API monetary values are strings in units of 1/10,000 USD (for example, `10000` is `$1.00`). The adapter does not derive the balance from cash, credit, debt, or invoice fields, and does not invent a percentage or reset time. OpenCode-discovered credentials are used only for the exact official Novita origin; a custom `baseUrl` requires an explicit `authPath` or `apiKey`, including `{env:NOVITA_API_KEY}`.

OpenRouter reads `GET https://openrouter.ai/api/v1/key` and displays the current API key's finite USD spending limit using `limit` and `limit_remaining`. This is **key-level spending-limit usage**, not total OpenRouter account balance. Reset cadence is shown only when the API reports `daily`, `weekly`, or `monthly`; no absolute reset countdown is inferred. Unbounded or unavailable limits are shown as unknown. Deprecated `rate_limit` and BYOK usage are ignored. OpenCode-discovered credentials are used only for the exact official OpenRouter origin; a custom `baseUrl` requires an explicit `authPath` or `apiKey`, including `{env:OPENROUTER_API_KEY}`.

Set `baseUrl` on `minimax` to `https://api.minimaxi.com` when using the mainland-China region. MiniMax always uses `Bearer` auth and ignores `authorizationScheme`.

## Credential Lookup

`authPath` and `apiKey` are optional overrides. Typical OpenCode users only need `enabled: true`; `label` is an optional display override. Credentials are discovered automatically from OpenCode auth and provider defaults. Set `apiKey` (or `authPath` to a standalone key file) only when auto-discovery is not enough.

Codex lookup order:

1. OpenCode auth at `~/.local/share/opencode/auth.json`, provider `openai`.
2. Codex auth file from `authPath`, default `~/.codex/auth.json`.

If an official-host request rejects the OpenCode credentials, the plugin retries with the configured or default Codex auth file.

ZAI lookup order:

1. Config `authPath`, which can point at OpenCode auth JSON or a simple `{ "key": "..." }` / `{ "apiKey": "..." }` JSON file.
2. OpenCode auth at `~/.local/share/opencode/auth.json`, provider `zai-coding-plan`.
3. OpenCode auth provider `zai`.
4. Config `apiKey`, including `{env:OC_ZAI_API_KEY}` references.

Synthetic lookup order:

1. Config `authPath` JSON file (`{ "key": "..." }` / `{ "apiKey": "..." }` / `{ "synthetic": { "key": "..." } }`).
2. OpenCode auth at `~/.local/share/opencode/auth.json`, provider `synthetic`.
3. Config `apiKey`, including `{env:OC_SYNTHETIC_API_KEY}` references.

MiniMax Token Plan lookup order:

1. Config `authPath` JSON file (`{ "key": "..." }` / `{ "apiKey": "..." }` / `{ "minimax-coding-plan": { "key": "..." } }`).
2. OpenCode auth at `~/.local/share/opencode/auth.json`, provider `minimax-coding-plan`, `minimax`, or `minimax-token-plan`.
3. Config `apiKey`, including `{env:OC_MINIMAX_TOKEN_PLAN_KEY}` references.

DeepSeek lookup order:

1. Config `authPath` JSON file (`{ "key": "..." }` / `{ "apiKey": "..." }` / `{ "deepseek": { "key": "..." } }`).
2. OpenCode auth at `~/.local/share/opencode/auth.json`, provider `deepseek`.
3. Config `apiKey`, including `{env:DEEPSEEK_API_KEY}` references.

Novita AI lookup order:

1. Config `authPath` JSON file (`{ "key": "..." }` / `{ "apiKey": "..." }` / `{ "novita-ai": { "key": "..." } }`).
2. OpenCode auth at `~/.local/share/opencode/auth.json`, provider `novita-ai`.
3. Config `apiKey`, including `{env:NOVITA_API_KEY}` references.

OpenRouter lookup order:

1. Config `authPath` JSON file (`{ "key": "..." }` / `{ "apiKey": "..." }` / `{ "openrouter": { "key": "..." } }`).
2. OpenCode auth at `~/.local/share/opencode/auth.json`, provider `openrouter` (only for the exact official OpenRouter origin).
3. Config `apiKey`, including `{env:OPENROUTER_API_KEY}` references. A custom `baseUrl` never receives an automatically discovered OpenCode credential.

Command Code lookup order:

1. Config `authPath` JSON file (`{ "key": "..." }` / `{ "apiKey": "..." }` / `{ "commandcode": { "key": "..." } }`).
2. OpenCode auth at `~/.local/share/opencode/auth.json`, provider `commandcode`.
3. Config `apiKey`, including `{env:COMMANDCODE_API_KEY}` references.

Command Code resolves account scope from `/alpha/whoami` before reading billing data. Organization IDs are sent with credit and summary requests; personal accounts omit the scope. If identity lookup fails, the refresh fails rather than silently querying the personal account. The 5-hour and weekly windows come from `/alpha/billing/credits`; the monthly window is derived from current credit balances and `/alpha/usage/summary`, and stays unknown if the summary is unavailable. OpenCode auth keys are only sent to the default official API URL; custom API URLs require an explicit `apiKey` unless an `authPath` is configured.

## Display

Sidebar rows look like:

```txt
Usage Limits
codex
  5h: 42% used resets 1h 2m
  weekly: 12% used resets 3d 4h
ZAI
  tokens: 18% used resets 2h
  MCP: 6% used
Synthetic
  5h: 0% used resets 11m
  weekly: 11% used resets 7m
MiniMax
  5h: 10% used resets 2h 56m
DeepSeek
  USD: $12.50 remaining
  CNY: ¥0.00 remaining
Novita AI
  balance: $100.00 remaining
OpenRouter
  spend: $25.50 / $100.00 used
```

Prompt footer shows compact usage when the current session model belongs to a supported provider:

```txt
5h: 42% used resets 1h 2m
```

Command Code sessions use the rolling 5-hour window in the prompt footer.

Provider mapping:

- OpenCode provider `openai` -> Codex usage.
- OpenCode provider `deepseek` -> DeepSeek balance usage.
- OpenCode provider `novita-ai` -> Novita AI available-balance usage.
- OpenCode provider `zai-coding-plan` -> ZAI token usage.
- OpenCode provider `synthetic` -> Synthetic usage.
- OpenCode provider `minimax-coding-plan` -> MiniMax Token Plan usage (prompt footer); `minimax` is also accepted as an alias.
- OpenCode provider `qwen` -> Qwen Token Plan usage.
- OpenCode provider `opencode-go` -> OpenCode GO usage.
- OpenCode provider `commandcode` -> Command Code usage.

## Development

```bash
bun install
bun run typecheck
bun run test
bun run check
bun run build
```

The package exposes a TUI entrypoint at `@mynameistito/opencode-usage-limits/tui` for OpenCode's package plugin loader.

## Notes

- The refresh interval defaults to 60 seconds.
- The effective minimum refresh interval is 15 seconds.
- Provider work starts in a scoped coordinator after both TUI slots are registered. Disposal interrupts the coordinator and its active provider work.
- Errors are intentionally short and do not include auth tokens or response bodies.
- MiniMax Token Plan returns `{ model_remains, base_resp }`; the per-model `current_interval_status` and `current_weekly_status` are treated as `1` = in plan and `3` = not in plan, and a window is hidden when its status is `3` (the API otherwise reports a meaningless `100%` remaining for a non-existent bucket).
