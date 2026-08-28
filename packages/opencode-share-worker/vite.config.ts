import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cloudflare({
      configPath:
        process.env.NODE_ENV === "development"
          ? "wrangler.local.jsonc"
          : "wrangler.jsonc",
    }),
  ],
});
