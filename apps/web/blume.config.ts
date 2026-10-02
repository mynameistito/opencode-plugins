import { defineConfig } from "blume";
import type { BlumeConfig } from "blume";
import { filesystem, githubReleases } from "blume/sources";

const reactGrab = {
  hooks: {
    "astro:config:setup": ({ injectScript }) => {
      injectScript(
        "page",
        "if (import.meta.env.DEV) { import('react-grab'); }"
      );
    },
  },
  name: "react-grab",
} satisfies NonNullable<BlumeConfig["integrations"]>[number];

export default defineConfig({
  agents: {
    llmsTxt: {
      details: [
        "## When to use these plugins",
        "",
        "Reach for these OpenCode v2 TUI plugins when you want a force-submit keybinding or provider quota visibility. Install packages from npm with `opencode2 plugin add`.",
      ].join("\n"),
      enabled: true,
    },
  },
  content: {
    sources: [
      filesystem({ root: "docs" }),
      githubReleases({
        owner: "mynameistito",
        prefix: "changelog",
        repo: "opencode-plugins",
      }),
    ],
  },
  deployment: {
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
  lastModified: "git",
  logo: { href: "/", text: "mynameistito / plugins" },
  navigation: {
    tabs: [{ label: "Changelog", path: "/changelog" }],
  },
  seo: {
    og: {
      enabled: true,
      palette: {
        accent: "#ff5410",
        background: "#1d1d1d",
        border: "#323232",
        foreground: "#fff6f2",
        muted: "#a6a19f",
      },
    },
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
