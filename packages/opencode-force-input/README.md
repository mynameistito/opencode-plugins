# @mynameistito/opencode-force-input

OpenCode TUI plugin that interrupts the active run and force-submits the current prompt with `Ctrl+Enter`.

## Install

This package contains the OpenCode v2 TUI plugin and is published from the monorepo `main` branch using npm's `latest` dist-tag.

```powershell
opencode2 plugin add "@mynameistito/opencode-force-input@latest" -g
```

OpenCode writes the plugin to `~/.config/opencode/cli.json`. Verify it is installed with:

```powershell
opencode2 plugin list
```

Update or reinstall it by removing and adding the package again:

```powershell
opencode2 plugin remove "@mynameistito/opencode-force-input@latest" -g
opencode2 plugin add "@mynameistito/opencode-force-input@latest" -g
```

Uninstall it with:

```powershell
opencode2 plugin remove "@mynameistito/opencode-force-input@latest" -g
```

To clear a cached package before reinstalling:

```powershell
Remove-Item -LiteralPath "$HOME\.cache\opencode\packages\@mynameistito\opencode-force-input@latest" -Recurse -Force -ErrorAction SilentlyContinue
```

The v2 package can also be configured manually in `~/.config/opencode/cli.json`:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": ["@mynameistito/opencode-force-input@latest"]
}
```

This package only exposes the `/tui` entrypoint. It does not provide a server plugin.

## Behavior

The plugin registers high-priority v2 keymap commands for `ctrl+return` and `ctrl+enter`. Each command dispatches `session.interrupt` three times, then `prompt.submit`, preserving OpenCode's guarded abort flow.

Remove `ctrl+return` from `input_newline` in `cli.json` if it is also configured as a newline binding:

```json
{ "keybinds": { "input_newline": "shift+return,alt+return,ctrl+j" } }
```

## Hint

While a session is open the composer shows a state-aware hint in its bottom right corner, inside the prompt box:

| Session state      | Hint                                |
| ------------------ | ----------------------------------- |
| idle               | `⏎ send`                            |
| running            | `⏎ steer · ctrl+⏎ interrupt & send` |
| shell mode or home | hidden                              |

`steer` matches OpenCode's default delivery for prompts submitted mid-run, so the hint shows what `Enter` will do before it is pressed, and `ctrl+⏎` stays visible while it can interrupt. A retrying session still counts as running, so the steer hint stays until the run succeeds, fails, or is interrupted. The hint renders through the same `prompt.footer.status` claim that mounts the keymap layer: OpenCode publishes no slot inside the textarea, so the indicator is lifted over the footer row with an absolute overlay (`top: -2`), landing on the composer's own info row. Disable it with plugin options:

```json
{
  "$schema": "https://opencode.ai/v2/cli.json",
  "plugins": [
    {
      "package": "@mynameistito/opencode-force-input@latest",
      "options": { "hint": false }
    }
  ]
}
```

## Windows Terminal

If Windows Terminal sends plain Enter for Ctrl+Enter, configure a `sendInput` action for `\u001b[13;5u` and bind it to `ctrl+enter` in the terminal settings.
