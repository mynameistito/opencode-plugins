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

const manifest: { workspaces?: string[] } = JSON.parse(
  await Bun.file("package.json").text()
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

for (const packageDirectory of packages) {
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
