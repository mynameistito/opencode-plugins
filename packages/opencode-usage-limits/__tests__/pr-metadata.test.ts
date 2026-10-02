import { describe, expect, it } from "vitest";

import {
  getComponentLabels,
  getMissingChangesets,
  getPullRequestFilePageCount,
  getRequiredChangesets,
  getSizeLabel,
  isChangesetReleasePR,
  isDuplicateLabelError,
  parseChangesetEntries,
  reconcileLabels,
} from "../../../scripts/pr-metadata-helpers.ts";

const forceInput = "@mynameistito/opencode-force-input";
const usageLimits = "@mynameistito/opencode-usage-limits";
const docs = "@mynameistito/opencode-plugins-docs";
const changeset = (entries: string): string =>
  `---\n${entries}\n---\nSummary\n`;

describe("PR metadata helpers", () => {
  it("maps package and documentation paths to component labels", () => {
    expect(
      getComponentLabels(
        [
          "packages/opencode-force-input/src/index.ts",
          "packages/opencode-usage-limits/src/index.ts",
          "apps/web/docs/index.mdx",
        ],
        []
      )
    ).toStrictEqual(new Set(["force-input", "usage-limits", "docs"]));
  });

  it("parses one or multiple valid Changeset package entries", () => {
    expect(
      parseChangesetEntries(changeset(`"${usageLimits}": patch`))
    ).toStrictEqual([usageLimits]);
    expect(
      parseChangesetEntries(
        changeset(`"${forceInput}": minor\n"${usageLimits}": patch`)
      )
    ).toStrictEqual([forceInput, usageLimits]);
  });

  it("ignores malformed or unsupported Changeset entries", () => {
    expect(
      parseChangesetEntries(`---\n${usageLimits}: sideways\n---`)
    ).toStrictEqual([]);
    expect(parseChangesetEntries("not frontmatter")).toStrictEqual([]);
  });

  it("unions path and Changeset component signals", () => {
    expect(
      getComponentLabels(["package.json"], [usageLimits, forceInput])
    ).toStrictEqual(new Set(["usage-limits", "force-input"]));
    expect(
      getComponentLabels(["packages/opencode-force-input/src/index.ts"], [])
    ).toStrictEqual(new Set(["force-input"]));
  });

  it("requires Changesets for meaningful plugin and docs changes only", () => {
    expect(
      getRequiredChangesets([
        "packages/opencode-force-input/src/index.ts",
        "packages/opencode-usage-limits/README.md",
        "apps/web/docs/usage-limits.mdx",
      ])
    ).toStrictEqual(new Set([forceInput, usageLimits, docs]));
    expect(
      getRequiredChangesets([
        "packages/opencode-force-input/__tests__/plugin.test.ts",
        "packages/opencode-usage-limits/scripts/test-package.ts",
        "packages/opencode-force-input/tsconfig.json",
        "packages/opencode-force-input/CONTRIBUTING.md",
      ])
    ).toStrictEqual(new Set());
  });

  it("reports changed packages without a matching Changeset entry", () => {
    expect(
      getMissingChangesets(
        new Set([forceInput, usageLimits]),
        new Set([forceInput])
      )
    ).toStrictEqual([usageLimits]);
    expect(
      getMissingChangesets(new Set([forceInput]), new Set([forceInput]))
    ).toStrictEqual([]);
  });

  it("paginates all pull request files up to the API limit", () => {
    expect(getPullRequestFilePageCount(0)).toBe(0);
    expect(getPullRequestFilePageCount(301)).toBe(4);
    expect(getPullRequestFilePageCount(3000)).toBe(30);
    expect(() => getPullRequestFilePageCount(3001)).toThrow(
      "more than 3000 changed files"
    );
  });

  it("exempts generated Changesets release pull requests", () => {
    expect(
      isChangesetReleasePR(
        "changeset-release/main",
        "mynameistito/opencode-plugins",
        "mynameistito/opencode-plugins"
      )
    ).toBeTruthy();
    expect(
      isChangesetReleasePR(
        "changeset-release/main",
        "fork/opencode-plugins",
        "mynameistito/opencode-plugins"
      )
    ).toBeFalsy();
    expect(
      isChangesetReleasePR(
        "feature/update-plugin",
        "mynameistito/opencode-plugins",
        "mynameistito/opencode-plugins"
      )
    ).toBeFalsy();
  });

  it("recognizes only GitHub's duplicate-label validation response", () => {
    expect(
      isDuplicateLabelError(
        422,
        JSON.stringify({ errors: [{ code: "already_exists" }] })
      )
    ).toBeTruthy();
    expect(
      isDuplicateLabelError(
        422,
        JSON.stringify({ errors: [{ code: "invalid" }] })
      )
    ).toBeFalsy();
    expect(isDuplicateLabelError(422, "not JSON")).toBeFalsy();
    expect(
      isDuplicateLabelError(
        500,
        JSON.stringify({ errors: [{ code: "already_exists" }] })
      )
    ).toBeFalsy();
  });

  it("removes stale managed labels but preserves unrelated labels", () => {
    expect(
      reconcileLabels(
        ["force-input", "size/l", "triaged"],
        new Set(["usage-limits", "size/s"]),
        new Set(["force-input", "usage-limits", "size/l", "size/s"])
      )
    ).toStrictEqual({
      add: ["usage-limits", "size/s"],
      remove: ["force-input", "size/l"],
    });
  });

  it("ignores lockfiles and generated output when measuring PR size", () => {
    expect(
      getSizeLabel([
        { additions: 50_000, deletions: 50_000, filename: "bun.lock" },
        {
          additions: 5000,
          deletions: 0,
          filename: "apps/web/.blume/generated.ts",
        },
        {
          additions: 4,
          deletions: 4,
          filename: "packages/plugin/src/index.ts",
        },
      ])
    ).toBe("size/xs");
    expect(
      getSizeLabel([{ additions: 1001, deletions: 0, filename: "src/a.ts" }])
    ).toBe("size/xl");
  });
});
