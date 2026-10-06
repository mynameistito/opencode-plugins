import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@/github": fileURLToPath(new URL(".github/scripts", import.meta.url)),
      "@/package-tarball": fileURLToPath(
        new URL("scripts/package-tarball", import.meta.url)
      ),
      "@/scripts": fileURLToPath(new URL("scripts", import.meta.url)),
    },
  },
});
