import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type DependencyField =
  | "dependencies"
  | "devDependencies"
  | "optionalDependencies"
  | "peerDependencies";
type DependencyMap = Record<string, string>;
const manifestFilename = "package.json";

interface PackageManifest {
  name: string;
  version: string;
  dependencies?: DependencyMap;
  devDependencies?: DependencyMap;
  optionalDependencies?: DependencyMap;
  peerDependencies?: DependencyMap;
}

// SAFETY: The root manifest is maintained in this repository and its catalog values are strings.
const rootManifest = JSON.parse(readFileSync(manifestFilename, "utf-8")) as {
  catalog?: Record<string, string>;
};
const catalog = rootManifest.catalog ?? {};

const resolveCatalog = (dependencies: DependencyMap): DependencyMap =>
  Object.fromEntries(
    Object.entries(dependencies).map(([name, value]) => {
      if (!value.startsWith("catalog:")) {
        return [name, value];
      }
      const dependency = value.slice("catalog:".length) || "default";
      const version = catalog[dependency];
      if (!version) {
        throw new Error(`Missing catalog entry for ${dependency}`);
      }
      return [name, version];
    })
  );

const resolveManifestCatalog = (manifest: PackageManifest): void => {
  const dependencyFields: DependencyField[] = [
    "dependencies",
    "devDependencies",
    "optionalDependencies",
    "peerDependencies",
  ];
  for (const field of dependencyFields) {
    const dependencies = manifest[field];
    if (dependencies) {
      manifest[field] = resolveCatalog(dependencies);
    }
  }
};

const npmPath = Bun.which("npm");
if (!npmPath) {
  throw new Error("npm is required to stage packages");
}

const stagePackage = (directory: { name: string }): void => {
  const packageDirectory = path.join("packages", directory.name);
  const manifest: PackageManifest = JSON.parse(
    readFileSync(path.join(packageDirectory, manifestFilename), "utf-8")
  );
  const packageSpec = `${manifest.name}@${manifest.version}`;

  try {
    execFileSync(
      npmPath,
      [
        "view",
        packageSpec,
        "version",
        "--prefer-online",
        "--min-release-age=0",
      ],
      { stdio: "ignore" }
    );
    console.log(`${packageSpec} is already published`);
    return;
  } catch {
    console.log(`Staging ${packageSpec} with npm latest`);
  }

  try {
    const packageManifestPath = path.join(packageDirectory, manifestFilename);
    const packageManifestText = readFileSync(packageManifestPath, "utf-8");
    // SAFETY: package.json is parsed and only known dependency sections are changed below.
    const packageManifest = JSON.parse(packageManifestText) as PackageManifest;
    resolveManifestCatalog(packageManifest);
    writeFileSync(
      packageManifestPath,
      `${JSON.stringify(packageManifest, null, 2)}\n`,
      "utf-8"
    );
    try {
      execFileSync(
        npmPath,
        [
          "stage",
          "publish",
          "--access",
          "public",
          "--tag",
          "latest",
          "--provenance",
        ],
        { cwd: packageDirectory, stdio: ["ignore", "inherit", "pipe"] }
      );
    } finally {
      writeFileSync(packageManifestPath, packageManifestText, "utf-8");
    }
  } catch (error) {
    const details =
      error instanceof Error && "stderr" in error ? String(error.stderr) : "";
    process.stderr.write(details);
    const message = `${error instanceof Error ? error.message : String(error)} ${details}`;
    if (
      !message.includes("E409") &&
      !message.includes("previously published")
    ) {
      throw error;
    }

    console.log(`${packageSpec} is already staged`);
  }
};

const hasPendingChangesets = readdirSync(".changeset").some((file) => {
  if (!file.endsWith(".md")) {
    return false;
  }

  const content = readFileSync(path.join(".changeset", file), "utf-8");
  return /^['"][^'"]+['"]\s*:\s*(?:patch|minor|major)$/mu.test(content);
});

if (hasPendingChangesets) {
  console.log("Pending Changesets found; waiting for the version PR");
  process.exit(0);
}

for (const directory of readdirSync("packages", { withFileTypes: true })) {
  if (directory.isDirectory()) {
    stagePackage(directory);
  }
}
