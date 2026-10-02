import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";

import { isUnexpectedPackagePath } from "./package-tarball-helpers.ts";

interface PackageManifest {
  name: string;
  files?: string[];
}

interface PackedFile {
  path: string;
  size: number;
}

interface PackResult {
  files: PackedFile[];
  size: number;
  unpackedSize: number;
}

const npmPath = Bun.which("npm");
if (!npmPath) {
  throw new Error("npm is required to validate package tarballs.");
}

export const checkPackageTarball = async (
  packageDirectory: string
): Promise<void> => {
  const absolutePackageDirectory = path.resolve(
    import.meta.dir,
    "..",
    packageDirectory
  );
  const manifestPath = path.join(absolutePackageDirectory, "package.json");
  // SAFETY: Package-specific manifest and required-file checks verify this structure.
  const manifest = JSON.parse(
    readFileSync(manifestPath, "utf-8")
  ) as PackageManifest;
  const childProcess = Bun.spawn(
    [npmPath, "pack", "--dry-run", "--json", "--ignore-scripts"],
    { cwd: absolutePackageDirectory, stderr: "inherit", stdout: "pipe" }
  );
  const output = await new Response(childProcess.stdout).text();
  if ((await childProcess.exited) !== 0) {
    throw new Error(`npm pack failed for ${manifest.name}.`);
  }
  // SAFETY: npm pack --json returns either a result array or a workspace map with the fields declared here.
  const parsed = JSON.parse(output) as
    | PackResult[]
    | Record<string, PackResult>;
  let pack: PackResult | undefined;
  if (Array.isArray(parsed)) {
    [pack] = parsed;
  } else {
    pack = parsed[manifest.name];
  }
  if (!pack || !Array.isArray(pack.files)) {
    throw new Error(`npm pack returned no result for ${manifest.name}`);
  }
  const packedPaths = new Set(pack.files.map(({ path: filePath }) => filePath));
  const requiredFiles =
    manifest.name === "@mynameistito/opencode-force-input"
      ? ["README.md", "LICENSE", "dist/index.mjs", "dist/index.d.mts"]
      : [
          "README.md",
          "LICENSE",
          "dist/index.mjs",
          "dist/index.d.mts",
          "usage-limits.schema.json",
          "examples/usage-limits.jsonc",
        ];
  const missingFiles = requiredFiles.filter((file) => !packedPaths.has(file));
  const unexpectedFiles = [...packedPaths].filter(isUnexpectedPackagePath);
  if (missingFiles.length > 0 || unexpectedFiles.length > 0) {
    throw new Error(
      [
        `npm pack validation failed for ${manifest.name}`,
        ...(missingFiles.length > 0
          ? [`Missing required files: ${missingFiles.join(", ")}`]
          : []),
        ...(unexpectedFiles.length > 0
          ? [`Unexpected files: ${unexpectedFiles.join(", ")}`]
          : []),
      ].join("\n")
    );
  }

  const summary = `| \`${manifest.name}\` | ${pack.files.length} | ${(pack.size / 1024).toFixed(1)} KB | ${(pack.unpackedSize / 1024).toFixed(1)} KB |`;
  console.log(
    `npm pack validation passed: ${manifest.name}, ${pack.files.length} files, ${(pack.size / 1024).toFixed(1)} KB packed.`
  );
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    if (readFileSync(summaryPath, "utf-8").length === 0) {
      appendFileSync(
        summaryPath,
        "| Package | Files | Packed | Unpacked |\n| --- | ---: | ---: | ---: |\n"
      );
    }
    appendFileSync(summaryPath, `${summary}\n`);
  }
};
