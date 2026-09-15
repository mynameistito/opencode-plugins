import type { AstroIntegration } from "astro";
import { defineConfig } from "blume";

const reactGrab: AstroIntegration = {
  hooks: {
    "astro:config:setup": ({ injectScript }) => {
      injectScript(
        "page",
        "if (import.meta.env.DEV) { import('react-grab'); }"
      );
    },
  },
  name: "react-grab",
};

export default defineConfig({
  ai: {
    llmsTxt: {
      details: [
        "## When to use these plugins",
        "",
        "Reach for these OpenCode v2 TUI plugins when you want a force-submit keybinding or provider quota visibility. Install packages from npm with `opencode2 plugin add`.",
      ].join("\n"),
      enabled: true,
    },
  },
  content: { root: "docs" },
  deployment: {
    output: "static",
    site: "https://opencode-plugins.mynameistito.com",
  },
  description:
    "Documentation for focused OpenCode v2 TUI plugins: force-submit prompts and monitor provider usage limits.",
  github: {
    dir: "apps/web",
    owner: "mynameistito",
    repo: "opencode-plugins",
  },
  integrations: [reactGrab],
  lastModified: true,
  logo: { href: "/", text: "mynameistito / plugins" },
  seo: {
    og: { enabled: true },
    robots: true,
    sitemap: true,
    structuredData: true,
  },
  theme: {
    accent: "#e05a33",
    action: "#c84825",
    mode: "system",
    radius: "sm",
  },
  title: "mynameistito / OpenCode plugins",
});
