import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const packages = new Map([
  ["force-input", "@mynameistito/opencode-force-input"],
  ["usage-limits", "@mynameistito/opencode-usage-limits"],
]);
const types = new Set(["patch", "minor", "major"]);
const [packageSelector, type, ...summaryParts] = process.argv.slice(2);
const packageName = packageSelector ? packages.get(packageSelector) : undefined;
const summary = summaryParts.join(" ").trim();

if (!packageName || !type || !types.has(type) || !summary) {
  console.error(
    'Usage: bun run changeset-add -- <force-input|usage-limits> <patch|minor|major> "summary"'
  );
  process.exit(1);
}

const filename = `${randomBytes(4).toString("hex")}.md`;
const changesetDirectory = path.resolve(".changeset");
await mkdir(changesetDirectory, { recursive: true });
await writeFile(
  path.resolve(changesetDirectory, filename),
  `---\n"${packageName}": ${type}\n---\n\n${summary}\n`,
  "utf-8"
);
console.log(`Created .changeset/${filename} for ${packageName}`);
