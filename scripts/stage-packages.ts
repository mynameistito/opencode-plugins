import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

interface PackageManifest {
  name: string;
  version: string;
}

const npmPath = Bun.which("npm");
if (!npmPath) {
  throw new Error("npm is required to stage packages");
}

const stagePackage = (directory: { name: string }): void => {
  const packageDirectory = path.join("packages", directory.name);
  const manifest: PackageManifest = JSON.parse(
    readFileSync(path.join(packageDirectory, "package.json"), "utf-8")
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
