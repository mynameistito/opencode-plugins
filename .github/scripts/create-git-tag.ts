import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { getNodeExecutablePath } from "@/scripts/shared/node-executable.ts";

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
const gitExecutable = process.env.GIT_EXECUTABLE;
if (!gitExecutable || !path.isAbsolute(gitExecutable)) {
  throw new Error("GIT_EXECUTABLE must be an absolute path to Git");
}

const existingTags = new Set(
  execFileSync(gitExecutable, ["ls-remote", "--tags", "origin"], {
    encoding: "utf-8",
  })
    .split("\n")
    .map((line) => line.match(/refs\/tags\/(?<tag>.+)$/u)?.groups?.tag)
    .filter((tag): tag is string => tag !== undefined && !tag.endsWith("^{}"))
);

execFileSync(
  getNodeExecutablePath(),
  [path.resolve("node_modules/@changesets/cli/bin.js"), "git-tag"],
  { stdio: "inherit" }
);

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
