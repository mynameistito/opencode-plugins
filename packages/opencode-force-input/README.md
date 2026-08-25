# @mynameistito/opencode-force-input

OpenCode TUI plugin that interrupts the active run and force-submits the current prompt with `Ctrl+Enter`.

## Install

This package contains the OpenCode v2 TUI plugin and is published from the monorepo `main` branch using npm's `latest` dist-tag.

```powershell
opencode2 plugin add "@mynameistito/opencode-force-input@latest" -g
```

OpenCode writes the plugin to `~/.config/opencode/tui.json`. Verify it is installed with:

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

The v2 package can also be configured manually in `~/.config/opencode/tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": ["@mynameistito/opencode-force-input@latest"]
}
```

Do not put this package in the server `plugins` list in `opencode.json` or `cli.json`. That loads the package root server entrypoint and will show the plugin under **Server**, not **TUI**. The TUI loader resolves the package's `/tui` export.

## Behavior

The plugin registers high-priority v2 keymap commands for `ctrl+return` and `ctrl+enter`. Each command dispatches `session.interrupt` three times, then `prompt.submit`, preserving OpenCode's guarded abort flow.

Remove `ctrl+return` from `input_newline` in `tui.json` if it is also configured as a newline binding:

```json
{ "keybinds": { "input_newline": "shift+return,alt+return,ctrl+j" } }
```

## Windows Terminal

If Windows Terminal sends plain Enter for Ctrl+Enter, configure a `sendInput` action for `\u001b[13;5u` and bind it to `ctrl+enter` in the terminal settings.
