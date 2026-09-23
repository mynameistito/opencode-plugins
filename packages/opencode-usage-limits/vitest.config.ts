import { fileURLToPath } from "node:url";

import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    solid({
      dev: false,
      hot: false,
      solid: { generate: "universal", moduleName: "@opentui/solid" },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("src", import.meta.url)),
    },
    conditions: ["bun"],
    dedupe: ["solid-js"],
  },
  ssr: {
    resolve: {
      conditions: ["bun"],
    },
  },
  test: {
    coverage: {
      exclude: ["src/errors.ts", "src/errors/config-decode.ts"],
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
    },
    environment: "node",
    include: ["__tests__/**/*.test.{ts,tsx}"],
    server: {
      deps: {
        inline: ["@opencode/plugin", "@opentui/solid", "solid-js"],
      },
    },
    setupFiles: ["./vitest.setup.ts"],
  },
});
