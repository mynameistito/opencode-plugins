# @mynameistito/opencode-doomscroll

An experimental OpenCode Desktop GUI plugin that opens Instagram Reels in OpenCode's built-in browser when a session starts running. It closes the tab it opened when the run ends. OpenCode does not automate scrolling or interact with Instagram.

## Local development

1. From the monorepo root, install dependencies and build the GUI bundle:

   ```powershell
   bun install --frozen-lockfile
   cd packages/opencode-doomscroll
   bun run build
   ```

2. Edit `%USERPROFILE%\.config\opencode\opencode.json` (or `.jsonc`) and add the package directory to its `plugins` list. Use an absolute path to this checkout, for example:

   ```json
   {
     "$schema": "https://opencode.ai/v2/opencode.json",
     "plugins": [
       "C:/Users/mynameistito/code/opencode-plugins/packages/opencode-doomscroll"
     ]
   }
   ```

   Merge that plugin entry into your existing global config rather than replacing other settings. The Desktop app reads `opencode.json`, not `cli.json`.

3. Restart OpenCode Desktop. Start a session; when it begins running, the plugin opens `https://www.instagram.com/reels/` in OpenCode's browser pane. The tab closes when the run succeeds, fails, or is interrupted. Sign in in the browser pane if Instagram asks.

For live development, leave this running while Desktop is open:

```powershell
cd packages/opencode-doomscroll
bun run dev
```

Each rebuild reloads the GUI plugin. Pause automatic opening from the Doomscroll settings page; this switch applies to the current window. You can open Reels manually from the command palette with “Open Instagram Reels”.

To keep automatic opening disabled after a restart, configure the plugin entry with an option:

```json
{
  "plugins": [
    {
      "package": "C:/Users/mynameistito/code/opencode-plugins/packages/opencode-doomscroll",
      "options": { "autoOpen": false }
    }
  ]
}
```

The GUI plugin API is experimental in OpenCode v2. It requires OpenCode Desktop and its built-in Browser plugin.
