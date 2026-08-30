import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    neverBundle: [
      "@opencode-ai/plugin",
      "@opencode-ai/plugin/tui",
      "@opencode-ai/plugin/tui/context",
      "@opentui/core",
      "@opentui/solid",
      "@opentui/solid/jsx-runtime",
      "solid-js",
      "solid-js/web",
    ],
  },
  dts: {
    sourcemap: true,
  },
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "dist",
  sourcemap: true,
});
