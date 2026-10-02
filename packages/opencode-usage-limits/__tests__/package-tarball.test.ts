import { describe, expect, it } from "vitest";

import { isUnexpectedPackagePath } from "../../../scripts/package-tarball-helpers.ts";

describe("package tarball paths", () => {
  it("rejects package source, test, and script directories", () => {
    expect(isUnexpectedPackagePath("src/index.ts")).toBeTruthy();
    expect(isUnexpectedPackagePath("__tests__/plugin.test.ts")).toBeTruthy();
    expect(isUnexpectedPackagePath("scripts/test-package.ts")).toBeTruthy();
  });

  it("rejects root-level test and build directories", () => {
    expect(isUnexpectedPackagePath("test/fixtures/sample.ts")).toBeTruthy();
    expect(isUnexpectedPackagePath("tests/fixtures/sample.ts")).toBeTruthy();
    expect(isUnexpectedPackagePath("spec/plugin.spec.ts")).toBeTruthy();
    expect(isUnexpectedPackagePath("build/output.js")).toBeTruthy();
  });

  it("rejects root-level test and build scripts", () => {
    expect(isUnexpectedPackagePath("test-package.ts")).toBeTruthy();
    expect(isUnexpectedPackagePath("build.ts")).toBeTruthy();
    expect(isUnexpectedPackagePath("plugin.test.ts")).toBeTruthy();
  });

  it("allows intended root package files and build output", () => {
    expect(isUnexpectedPackagePath("README.md")).toBeFalsy();
    expect(isUnexpectedPackagePath("dist/index.mjs")).toBeFalsy();
    expect(isUnexpectedPackagePath("usage-limits.schema.json")).toBeFalsy();
  });
});
