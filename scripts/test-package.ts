const entrypoint = new URL("../dist/tui.mjs", import.meta.url);
const packageModule = (await import(entrypoint.href)) as {
  default?: { id?: string; setup?: unknown };
};
const plugin = packageModule.default;

if (
  plugin?.id !== "mynameistito.oc-ctrl-enter-force-import" ||
  typeof plugin.setup !== "function"
) {
  throw new Error(
    "Package smoke test failed: invalid OpenCode v2 plugin export"
  );
}

console.log(`Package smoke test passed: ${plugin.id}`);
