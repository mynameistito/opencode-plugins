import { defineConfig } from "oxlint";
import antiSlop from "ultracite/oxlint/anti-slop";
import core from "ultracite/oxlint/core";
import { selectJsPlugins } from "ultracite/oxlint/js-plugins";
import solid from "ultracite/oxlint/solid";
import vitest from "ultracite/oxlint/vitest";

const jsPlugins = selectJsPlugins(["github", "sonarjs"]);

export default defineConfig({
  extends: [antiSlop, core, solid, vitest, jsPlugins],
  ignorePatterns: core.ignorePatterns,
  jsPlugins: jsPlugins.jsPlugins,
});
