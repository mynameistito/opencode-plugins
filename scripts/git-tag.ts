import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

interface PackageManifest {
  name: string;
  version: string;
}

interface ChangesetsOutputEvent {
  packageName: string;
  tag: string;
  type: "git-tag";
}

const outputPath = process.env.CHANGESETS_OUTPUT;
if (!outputPath) {
  throw new Error("CHANGESETS_OUTPUT is required by the Changesets action");
}

const gitPath = Bun.which("git");
const bunxPath = Bun.which("bunx");
if (!gitPath || !bunxPath) {
  throw new Error("git and bunx are required to create release tags");
}

const existingTags = new Set(
  execFileSync(gitPath, ["ls-remote", "--tags", "origin"], {
    encoding: "utf-8",
  })
    .split("\n")
    .map((line) => line.match(/refs\/tags\/(?<tag>.+)$/u)?.groups?.tag)
    .filter((tag): tag is string => tag !== undefined && !tag.endsWith("^{}"))
);

execFileSync(bunxPath, ["changeset", "git-tag"], {
  stdio: "inherit",
});

const events: ChangesetsOutputEvent[] = [];
for (const directory of readdirSync("packages", { withFileTypes: true })) {
  if (!directory.isDirectory()) {
    continue;
  }

  const manifest: PackageManifest = JSON.parse(
    readFileSync(path.join("packages", directory.name, "package.json"), "utf-8")
  );
  const tag = `${manifest.name}@${manifest.version}`;

  if (!existingTags.has(tag)) {
    events.push({ packageName: manifest.name, tag, type: "git-tag" });
  }
}

writeFileSync(
  outputPath,
  events.map((event) => JSON.stringify(event)).join("\n"),
  "utf-8"
);
