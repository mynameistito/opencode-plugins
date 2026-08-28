import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  deps: {
    neverBundle: [
      "@opencode-ai/plugin",
      "@opencode-ai/plugin/tui",
      "@opencode-ai/plugin/tui/context",
    ],
  },
  dts: { sourcemap: true },
  entry: { tui: "./tui.tsx" },
  format: ["esm"],
  outDir: "dist",
  sourcemap: true,
});
