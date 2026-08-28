// SAFETY: The built package is checked below for the expected plugin shape.
const module = (await import(
  new URL("../dist/tui.mjs", import.meta.url).href
)) as { default?: { id?: string; setup?: unknown } };
if (
  module.default?.id !== "mynameistito.opencode-share" ||
  module.default.setup === undefined
) {
  throw new Error(
    "Package smoke test failed: invalid OpenCode V2 TUI plugin export"
  );
}
console.log(`Package smoke test passed: ${module.default.id}`);
