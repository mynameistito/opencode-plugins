import { fileURLToPath } from "node:url";

import solid from "vite-plugin-solid";
import { defineConfig } from "vitest/config";

const runtimeConditions = process.env.NODE_COMPAT === "true" ? [] : ["bun"];

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
    conditions: runtimeConditions,
    dedupe: ["solid-js"],
  },
  ssr: {
    resolve: {
      conditions: runtimeConditions,
    },
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "./coverage",
    },
    environment: "node",
    include: ["__tests__/**/*.test.{ts,tsx}"],
    isolate: false,
    server: {
      deps: {
        inline: ["@opencode/plugin", "@opentui/solid", "solid-js"],
      },
    },
    setupFiles: ["./vitest.setup.ts"],
  },
});
