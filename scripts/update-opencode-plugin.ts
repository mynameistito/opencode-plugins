import { appendFile, readFile, writeFile } from "node:fs/promises";

import { isNewerSemVer, parseSerializedSemVer } from "./semver";

const packageJsonPath = new URL("../package.json", import.meta.url);
const packageJson: unknown = JSON.parse(
  await readFile(packageJsonPath, "utf-8")
);

if (
  !(packageJson instanceof Object) ||
  Array.isArray(packageJson) ||
  !("catalog" in packageJson)
) {
  throw new TypeError("Root package.json must contain an object");
}

const { catalog } = packageJson;

if (
  !(catalog instanceof Object) ||
  Array.isArray(catalog) ||
  !("@opencode/plugin" in catalog)
) {
  throw new TypeError("Root package.json must define a catalog object");
}

const currentVersion = parseSerializedSemVer(
  JSON.stringify(catalog["@opencode/plugin"]) ?? "",
  "Root package catalog"
);

const response = await fetch(
  "https://registry.npmjs.org/@opencode%2fplugin/latest"
);

if (!response.ok) {
  throw new Error(
    `npm registry returned ${response.status} for @opencode/plugin`
  );
}

const metadata: unknown = await response.json();

if (
  !(metadata instanceof Object) ||
  Array.isArray(metadata) ||
  !("version" in metadata)
) {
  throw new TypeError("npm registry response must contain package metadata");
}

const latestVersion = parseSerializedSemVer(
  JSON.stringify(metadata.version) ?? "",
  "npm registry response"
);

const changed = isNewerSemVer(latestVersion.value, currentVersion.value);

if (changed) {
  Reflect.set(catalog, "@opencode/plugin", latestVersion.value);
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
