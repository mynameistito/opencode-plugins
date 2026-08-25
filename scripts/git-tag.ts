import { execFileSync } from "node:child_process";

const outputPath = process.env.CHANGESETS_OUTPUT;
if (!outputPath) {
  throw new Error("CHANGESETS_OUTPUT is required by the Changesets action");
}

execFileSync("bunx", ["changeset", "git-tag", "--output", outputPath], {
  stdio: "inherit",
});
