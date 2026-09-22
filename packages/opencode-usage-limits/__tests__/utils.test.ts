import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, test } from "vitest";

import {
  clampPercent,
  isRecord,
  parseJsonValue,
  readJsonFile,
} from "@/utils.ts";

describe("utility helpers", () => {
  test.each([
    [-1, 0],
    [0, 0],
    [42.5, 42.5],
    [101, 100],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])("clamps %s to %s", (input, expected) => {
    expect(clampPercent(input)).toBe(expected);
  });

  test("detects plain records", () => {
    expect(isRecord({})).toBeTruthy();
    expect(isRecord({ nested: true })).toBeTruthy();
    expect(isRecord([])).toBeFalsy();
    expect(isRecord(null)).toBeFalsy();
    expect(isRecord("object")).toBeFalsy();
  });

  test("rejects parsed non-finite numbers", () => {
    expect(() => parseJsonValue("1e400")).toThrow(SyntaxError);
  });

  test("parses null and escaped JSON string values", () => {
    expect(parseJsonValue("null")).toBeNull();
    expect(parseJsonValue(String.raw`"quote: \" and slash: \\"`)).toBe(
      'quote: " and slash: \\'
    );
  });

  test("reads JSONC with line comments, block comments, quoted slashes, and trailing commas", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "oc-usage-limits-"));
    const filePath = path.join(directory, "config.jsonc");

    try {
      await writeFile(
        filePath,
        String.raw`{
          // provider config
          "url": "https://example.com//kept",
          "literal": ",}",
          "quoted": "value // kept",
          "nested": {
            "enabled": true,
          },
          /* block comment */
          "items": [1, 2,],
        }`,
        "utf-8"
      );

      await expect(readJsonFile(filePath)).resolves.toStrictEqual({
        items: [1, 2],
        literal: ",}",
        nested: { enabled: true },
        quoted: "value // kept",
        url: "https://example.com//kept",
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test("reads BOM-prefixed JSONC", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "oc-usage-limits-"));
    const filePath = path.join(directory, "config.jsonc");

    try {
      await writeFile(
        filePath,
        '\uFEFF{\n  // provider config\n  "enabled": true,\n}',
        "utf-8"
      );

      await expect(readJsonFile(filePath)).resolves.toStrictEqual({
        enabled: true,
      });
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  test.each([
    ['{"value":"unterminated}', "unterminated string"],
    ['{"value":1} /* unterminated', "unterminated block comment"],
  ])("rejects malformed JSONC with an %s", async (input) => {
    const directory = await mkdtemp(path.join(tmpdir(), "oc-usage-limits-"));
    const filePath = path.join(directory, "config.jsonc");
    try {
      await writeFile(filePath, input, "utf-8");
      await expect(readJsonFile(filePath)).rejects.toBeInstanceOf(SyntaxError);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });
});
