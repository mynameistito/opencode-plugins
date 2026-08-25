const tuiEntrypoint = new URL("../dist/tui.mjs", import.meta.url);
const tuiModule = await import(tuiEntrypoint.href);
const tuiPlugin = tuiModule.default;

const hasValidTuiPlugin =
  tuiPlugin?.id === "mynameistito.opencode-force-input" &&
  tuiPlugin.setup !== undefined;

if (!hasValidTuiPlugin) {
  throw new Error(
    "Package smoke test failed: invalid OpenCode v2 TUI plugin export"
  );
}

console.log(`Package smoke test passed: ${tuiPlugin.id}`);
