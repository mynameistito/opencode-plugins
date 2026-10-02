import { appendFile, readFile, writeFile } from "node:fs/promises";

const serializedVersionPattern =
  /^"\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?"$/u;

const parseVersion = (serialized: string, source: string): string => {
  if (!serializedVersionPattern.test(serialized)) {
    throw new TypeError(`${source} did not contain a valid package version`);
  }

  return serialized.slice(1, -1);
};

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

const currentVersion = parseVersion(
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

const latestVersion = parseVersion(
  JSON.stringify(metadata.version) ?? "",
  "npm registry response"
);

const changed = currentVersion !== latestVersion;

if (changed) {
  Reflect.set(catalog, "@opencode/plugin", latestVersion);
  await writeFile(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

const outputPath = process.env.GITHUB_OUTPUT;

if (outputPath) {
  await appendFile(
    outputPath,
    `changed=${changed}\nversion=${latestVersion}\n`
  );
}

console.log(
  changed
    ? `Updated @opencode/plugin from ${currentVersion} to ${latestVersion}`
    : `@opencode/plugin is already current at ${currentVersion}`
);
