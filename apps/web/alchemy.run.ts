import { Stack, Stage } from "alchemy";
import { providers, state, Website } from "alchemy/Cloudflare";
import { gen } from "effect/Effect";

export default Stack(
  "OpenCodePluginsDocs",
  { providers: providers(), state: state() },
  gen(function* docsStack() {
    const stage = yield* Stage;
    const site = yield* Website.StaticSite("Docs", {
      assets: {
        htmlHandling: "drop-trailing-slash",
        notFoundHandling: "404-page",
      },
      command: "bun run build",
      domain:
        stage === "prod" ? "opencode-plugins.mynameistito.com" : undefined,
      memo: {
        include: [
          "docs/**",
          "public/**",
          "blume.config.ts",
          "theme.css",
          "package.json",
          "../../bun.lock",
        ],
      },
      name:
        stage === "prod"
          ? "opencode-plugins-docs"
          : `opencode-plugins-docs-${stage}`,
      outdir: "dist",
    });

    return { url: site.url };
  })
);
