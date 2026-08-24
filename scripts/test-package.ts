const serverEntrypoint = new URL("../dist/index.mjs", import.meta.url);
const tuiEntrypoint = new URL("../dist/tui.mjs", import.meta.url);
const serverModule = (await import(serverEntrypoint.href)) as {
  default?: { id?: string; setup?: unknown; tui?: boolean };
};
const tuiModule = (await import(tuiEntrypoint.href)) as {
  default?: { id?: string; setup?: unknown };
};
const serverPlugin = serverModule.default;
const tuiPlugin = tuiModule.default;

if (
  serverPlugin?.id !== "mynameistito.oc-ctrl-enter-force-import" ||
  serverPlugin.tui !== true ||
  typeof serverPlugin.setup !== "function" ||
  tuiPlugin?.id !== "mynameistito.oc-ctrl-enter-force-import" ||
  typeof tuiPlugin.setup !== "function"
) {
  throw new Error(
    "Package smoke test failed: invalid OpenCode v2 plugin exports"
  );
}

console.log(
  `Package smoke test passed: ${serverPlugin.id} and ${tuiPlugin.id}`
);
