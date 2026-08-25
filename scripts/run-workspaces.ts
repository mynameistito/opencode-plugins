import { resolve } from "node:path";

const task = process.argv[2];
const supportedTasks = [
  "build",
  "check",
  "fix",
  "knip",
  "test",
  "test:package",
  "typecheck",
] as const;

if (!supportedTasks.includes(task as (typeof supportedTasks)[number])) {
  console.error(`Usage: bun run scripts/run-workspaces.ts <${supportedTasks.join("|")}>`);
  process.exit(1);
}

const packages = ["packages/opencode-force-input", "packages/opencode-usage-limits"];

for (const packageDirectory of packages) {
  console.log(`\n==> ${packageDirectory} ${task}`);
  const result = Bun.spawnSync(["bun", "run", task], {
    cwd: resolve(packageDirectory),
    stderr: "inherit",
    stdout: "inherit",
  });

  if (result.exitCode !== 0) {
    process.exit(result.exitCode);
  }
}
