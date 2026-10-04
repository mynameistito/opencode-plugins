import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDirectory = fileURLToPath(new URL("../", import.meta.url));
const nodeModulesDirectory = "node_modules";
const packageManifestFile = "package.json";
const packageDirectories = ["packages", "apps"]
  .flatMap((parent) => {
    const parentPath = path.join(rootDirectory, parent);
    return readdirSync(parentPath, { withFileTypes: true })
      .filter(
        (entry) =>
          entry.isDirectory() &&
          readdirSync(path.join(parentPath, entry.name)).includes(
            packageManifestFile
          )
      )
      .map((entry) => path.join(parent, entry.name));
  })
  .toSorted();

const run = (command, args, cwd = rootDirectory) => {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const vitestCli = path.join(rootDirectory, "node_modules/vitest/vitest.mjs");
const runPackageCli = (script, packagePath) => {
  const [command, ...args] = script.split(/\s+/u);
  const manifestPath = [
    path.join(packagePath, nodeModulesDirectory, command, packageManifestFile),
    path.join(
      rootDirectory,
      nodeModulesDirectory,
      command,
      packageManifestFile
    ),
  ].find(existsSync);
  if (!manifestPath) {
    throw new Error(`Could not resolve package manifest for ${command}.`);
  }
  const cliManifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  const bin = cliManifest.bin[command];
  if (!bin) {
    throw new Error(`Could not resolve executable for ${command}.`);
  }
  run(
    process.execPath,
    [path.resolve(path.dirname(manifestPath), bin), ...args],
    packagePath
  );
};

for (const packageDirectory of packageDirectories) {
  const packagePath = path.join(rootDirectory, packageDirectory);
  const manifest = JSON.parse(
    readFileSync(path.join(packagePath, packageManifestFile), "utf-8")
  );
  if (manifest.scripts?.build) {
    console.log(`\n==> ${packageDirectory} build (Node)`);
    runPackageCli(manifest.scripts.build, packagePath);
  }
  if (manifest.scripts?.test) {
    console.log(`\n==> ${packageDirectory} test (Node)`);
    if (existsSync(path.join(packagePath, "vitest.config.ts"))) {
      const result = spawnSync(
        process.execPath,
        [
          vitestCli,
          "run",
          "--config",
          path.join(packagePath, "vitest.config.ts"),
        ],
        {
          cwd: packagePath,
          env: { ...process.env, NODE_COMPAT: "true" },
          stdio: "inherit",
        }
      );
      if (result.error) {
        throw result.error;
      }
      if (result.status !== 0) {
        process.exit(result.status ?? 1);
      }
    } else {
      runPackageCli(manifest.scripts.test, packagePath);
    }
  }
}
