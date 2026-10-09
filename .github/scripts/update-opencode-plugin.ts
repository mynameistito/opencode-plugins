import { appendFile, readFile, writeFile } from "node:fs/promises";

import { isNewerSemVer, parseSemVer } from "@/github/semver.ts";

interface PackageManifest {
  catalog: Record<string, string>;
}

interface PackageMetadata {
  version: string;
}

const packageJsonPath = new URL("../../package.json", import.meta.url);
const packageJson: PackageManifest = JSON.parse(
  await readFile(packageJsonPath, "utf-8")
);
const currentVersionText = packageJson.catalog["@opencode/plugin"];
if (!currentVersionText) {
  throw new TypeError("Root package catalog must define @opencode/plugin.");
}

const currentVersion = parseSemVer(currentVersionText, "Root package catalog");

const response = await fetch(
  "https://registry.npmjs.org/@opencode%2fplugin/latest",
  { signal: AbortSignal.timeout(15_000) }
);

if (!response.ok) {
  throw new Error(
    `npm registry returned ${response.status} for @opencode/plugin`
  );
}

const metadata: PackageMetadata = JSON.parse(await response.text());
const latestVersionText = metadata.version;
if (!latestVersionText) {
  throw new TypeError("npm registry response must contain a version.");
}

const latestVersion = parseSemVer(latestVersionText, "npm registry response");

const changed = isNewerSemVer(latestVersion.value, currentVersion.value);

if (changed) {
  packageJson.catalog["@opencode/plugin"] = latestVersion.value;
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

const outputPath = process.env.GITHUB_OUTPUT;

if (outputPath) {
  await appendFile(
    outputPath,
    `changed=${changed}\nversion=${latestVersion.value}\n`
  );
}

console.log(
  changed
    ? `Updated @opencode/plugin from ${currentVersion.value} to ${latestVersion.value}`
    : `@opencode/plugin is already current at ${currentVersion.value}`
);
