import { readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
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
      ["view", packageSpec, "version", "--prefer-online", "--min-release-age=0"],
      { stdio: "ignore" }
    );
    console.log(`${packageSpec} is already published`);
    continue;
  } catch {
    console.log(`Staging ${packageSpec} with npm latest`);
  }

  execFileSync(
    "npm",
    ["stage", "publish", "--access", "public", "--tag", "latest", "--provenance"],
    { cwd: packageDirectory, stdio: "inherit" }
  );

}
