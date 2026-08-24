# oc-ctrl-enter-force-import

OpenCode TUI plugin that interrupts the active run and force-submits the current prompt with `Ctrl+Enter`.

## Release Tracks

| Track | Branch | npm tag | OpenCode CLI |
| --- | --- | --- | --- |
| Stable | `main` | `latest` | `opencode` |
| OpenCode v2 beta | `v2` | `beta` | `opencode2` from `@opencode-ai/cli@beta` |

Do not mix the plugin and CLI tracks. The v2 plugin uses the v2 plugin API and is not intended for stable OpenCode.

## Stable OpenCode

Install the stable plugin globally:

```powershell
opencode plugin "@mynameistito/oc-ctrl-enter-force-import@latest" -g
```

OpenCode writes the plugin to `~/.config/opencode/tui.json`. Verify it is installed with:

```powershell
opencode plugin list -g
```

Update or reinstall it with `--force`:

```powershell
opencode plugin "@mynameistito/oc-ctrl-enter-force-import@latest" -g --force
```

Uninstall it with:

```powershell
opencode plugin "@mynameistito/oc-ctrl-enter-force-import" -g --remove
```

## OpenCode v2 Beta

Install the beta CLI and beta plugin:

```powershell
bun add --global @opencode-ai/cli@beta
opencode2 plugin add "@mynameistito/oc-ctrl-enter-force-import@beta"
```

Verify the CLI and plugin:

```powershell
opencode2 --version
opencode2 plugin list
```

Update or reinstall the beta plugin with `--force`:

```powershell
opencode2 plugin remove "@mynameistito/oc-ctrl-enter-force-import@beta"
opencode2 plugin add "@mynameistito/oc-ctrl-enter-force-import@beta"
```

Switch stable to beta by removing the stable plugin from `opencode.json`, installing the beta CLI, and running the beta `plugin add` command. Switch back by removing the beta plugin and adding the stable package; do not leave both entries in the same `opencode.json`.

To clear a cached package before reinstalling:

```powershell
Remove-Item -LiteralPath "$HOME\.cache\opencode\packages\@mynameistito\oc-ctrl-enter-force-import@latest" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath "$HOME\.cache\opencode\packages\@mynameistito\oc-ctrl-enter-force-import@beta" -Recurse -Force -ErrorAction SilentlyContinue
```

The v2 package can also be configured manually in `~/.config/opencode/opencode.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugins": ["@mynameistito/oc-ctrl-enter-force-import@beta"]
}
```

For stable OpenCode, use `opencode.json` with `@latest` and the stable `opencode` CLI instead.

## Behavior

The plugin registers high-priority v2 keymap commands for `ctrl+return` and `ctrl+enter`. Each command dispatches `session.interrupt` twice, then `prompt.submit`, preserving OpenCode's guarded abort flow.

Remove `ctrl+return` from `input_newline` in `tui.json` if it is also configured as a newline binding:

```json
{ "keybinds": { "input_newline": "shift+return,alt+return,ctrl+j" } }
```

## Windows Terminal

If Windows Terminal sends plain Enter for Ctrl+Enter, configure a `sendInput` action for `\u001b[13;5u` and bind it to `ctrl+enter` in the terminal settings.
