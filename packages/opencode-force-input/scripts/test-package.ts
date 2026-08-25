const serverEntrypoint = new URL("../dist/index.mjs", import.meta.url);
const tuiEntrypoint = new URL("../dist/tui.mjs", import.meta.url);
const serverModule = await import(serverEntrypoint.href);
const tuiModule = await import(tuiEntrypoint.href);
const serverPlugin = serverModule.default;
const tuiPlugin = tuiModule.default;

const hasValidServerPlugin =
  serverPlugin?.id === "mynameistito.opencode-force-input" &&
  serverPlugin.tui === true &&
  serverPlugin.setup !== undefined;
const hasValidTuiPlugin =
  tuiPlugin?.id === "mynameistito.opencode-force-input" &&
  tuiPlugin.setup !== undefined;

if (!hasValidServerPlugin || !hasValidTuiPlugin) {
  throw new Error(
    "Package smoke test failed: invalid OpenCode v2 plugin exports"
  );
}

console.log(
  `Package smoke test passed: ${serverPlugin.id} and ${tuiPlugin.id}`
);
