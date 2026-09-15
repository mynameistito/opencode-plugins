import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

const [task] = process.argv.slice(2);
const supportedTasks = [
  "build",
  "check",
  "fix",
  "knip",
  "test",
  "test:package",
  "typecheck",
] as const;

const isSupportedTask = (
  value: string | undefined
): value is (typeof supportedTasks)[number] =>
  supportedTasks.some((supportedTask) => supportedTask === value);

if (!isSupportedTask(task)) {
  console.error(
    `Usage: bun run scripts/run-workspaces.ts <${supportedTasks.join("|")}>`
  );
  process.exit(1);
}

const packageManifestFile = "package.json";
const manifest: { workspaces?: string[] } = JSON.parse(
  await Bun.file(packageManifestFile).text()
);
const workspacePatterns = manifest.workspaces ?? [];
const packages = workspacePatterns
  .filter((pattern) => pattern.endsWith("/*"))
  .flatMap((pattern) => {
    const parentDirectory = pattern.slice(0, -2);
    return readdirSync(parentDirectory, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          existsSync(path.join(parentDirectory, entry.name, "package.json"))
      )
      .map((entry) => path.join(parentDirectory, entry.name));
  })
  .toSorted();

const packageManifests = await Promise.all(
  packages.map(async (packageDirectory) => {
    const packageManifest: { scripts?: Record<string, string> } = JSON.parse(
      await Bun.file(path.join(packageDirectory, packageManifestFile)).text()
    );
    return { directory: packageDirectory, manifest: packageManifest };
  })
);

for (const {
  directory: packageDirectory,
  manifest: packageManifest,
} of packageManifests) {
  if (packageManifest.scripts?.[task] === undefined) {
    continue;
  }

  console.log(`\n==> ${packageDirectory} ${task}`);
  const result = Bun.spawnSync(["bun", "run", task], {
    cwd: path.resolve(packageDirectory),
    stderr: "inherit",
    stdout: "inherit",
  });

  if (result.exitCode !== 0) {
    process.exit(result.exitCode);
  }
}
