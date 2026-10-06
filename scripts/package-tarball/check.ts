import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import path from "node:path";

import { isUnexpectedPackagePath } from "@/package-tarball/package-tarball-helpers.ts";
import type { JsonValue } from "@/scripts/shared/json-value.ts";
import {
  parseJsonArray,
  parseJsonNumber,
  parseJsonObject,
  parseJsonString,
} from "@/scripts/shared/json-value.ts";
import { getNodeExecutablePath } from "@/scripts/shared/node-executable.ts";
import { getNpmCliPath } from "@/scripts/shared/npm-cli.ts";

interface PackageManifest {
  name: string;
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

const parsePackageManifest = (value: JsonValue): PackageManifest => {
  const manifest = parseJsonObject(value, "Package manifest");
  return {
    name: parseJsonString(manifest.get("name") ?? null, "Package name"),
  };
};

const parsePackResult = (value: JsonValue): PackResult => {
  const result = parseJsonObject(value, "npm pack result");
  const files = parseJsonArray(
    result.get("files") ?? null,
    "npm pack files"
  ).map((file, index) => {
    const packedFile = parseJsonObject(file, `npm pack file ${index}`);
    return {
      path: parseJsonString(
        packedFile.get("path") ?? null,
        `npm pack file ${index} path`
      ),
      size: parseJsonNumber(
        packedFile.get("size") ?? null,
        `npm pack file ${index} size`
      ),
    };
  });
  return {
    files,
    size: parseJsonNumber(result.get("size") ?? null, "npm pack size"),
    unpackedSize: parseJsonNumber(
      result.get("unpackedSize") ?? null,
      "npm pack unpacked size"
    ),
  };
};

export const checkPackageTarball = (packageDirectory: string): void => {
  const absolutePackageDirectory = path.resolve(
    import.meta.dirname,
    "..",
    "..",
    packageDirectory
  );
  const manifestPath = path.join(absolutePackageDirectory, "package.json");
  const manifestValue: JsonValue = JSON.parse(
    readFileSync(manifestPath, "utf-8")
  );
  const manifest = parsePackageManifest(manifestValue);
  const output = execFileSync(
    getNodeExecutablePath(),
    [getNpmCliPath(), "pack", "--dry-run", "--json", "--ignore-scripts"],
    {
      cwd: absolutePackageDirectory,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "inherit"],
    }
  );
  const parsed: JsonValue = JSON.parse(output);
  const packValue: JsonValue | null = Array.isArray(parsed)
    ? (parsed[0] ?? null)
    : (parseJsonObject(parsed, "npm pack response").get(manifest.name) ?? null);
  if (packValue === null) {
    throw new Error(`npm pack returned no result for ${manifest.name}`);
  }
  const pack = parsePackResult(packValue);
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
