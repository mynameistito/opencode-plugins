import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

interface PackageManifest {
  name: string;
  version: string;
}

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
  if (!directory.isDirectory()) {
    continue;
  }

  const packageDirectory = path.join("packages", directory.name);
  const manifest = JSON.parse(
    readFileSync(path.join(packageDirectory, "package.json"), "utf-8")
  ) as PackageManifest;
  const packageSpec = `${manifest.name}@${manifest.version}`;

  try {
    execFileSync(
      "npm",
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
    continue;
  } catch {
    console.log(`Staging ${packageSpec} with npm latest`);
  }

  try {
    execFileSync(
      "npm",
      [
        "stage",
        "publish",
        "--access",
        "public",
        "--tag",
        "latest",
        "--provenance",
      ],
      { cwd: packageDirectory, stdio: "inherit" }
    );
  } catch (error) {
    const details =
      error && typeof error === "object" && "stderr" in error
        ? String(error.stderr)
        : "";
    const message = `${error instanceof Error ? error.message : String(error)} ${details}`;
    if (
      !message.includes("E409") &&
      !message.includes("previously published")
    ) {
      throw error;
    }

    console.log(`${packageSpec} is already staged`);
  }
}
