import { describe, expect, it } from "vitest";

import { isNewerSemVer, parseSemVer } from "@/github/semver.ts";

describe("Semantic version comparison", () => {
  it("returns true only when the candidate is newer", () => {
    expect(isNewerSemVer("2.0.22", "2.0.21")).toBeTruthy();
    expect(isNewerSemVer("2.0.21", "2.0.21")).toBeFalsy();
    expect(isNewerSemVer("2.0.20", "2.0.21")).toBeFalsy();
  });

  it("compares prereleases according to SemVer precedence", () => {
    expect(isNewerSemVer("1.0.0", "1.0.0-rc.2")).toBeTruthy();
    expect(isNewerSemVer("1.0.0-rc.10", "1.0.0-rc.2")).toBeTruthy();
    expect(isNewerSemVer("1.0.0-rc.2", "1.0.0-rc.10")).toBeFalsy();
  });

  it("ignores build metadata when comparing precedence", () => {
    expect(isNewerSemVer("1.0.0+build.2", "1.0.0+build.1")).toBeFalsy();
  });

  it("rejects malformed versions", () => {
    expect(() => parseSemVer("1.0", "test")).toThrow(TypeError);
    expect(() => parseSemVer("1.0.0-01", "test")).toThrow(TypeError);
  });

  it("parses unquoted package version strings", () => {
    expect(parseSemVer("2.0.23", "test").value).toBe("2.0.23");
  });
});
