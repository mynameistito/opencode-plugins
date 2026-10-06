import { describe, expect, it } from "vitest";

import {
  parseJsonArray,
  parseJsonNumber,
  parseJsonObject,
  parseJsonString,
} from "@/scripts/shared/json-value.ts";

describe("JSON value parsing", () => {
  it("parses objects into a typed map of JSON values", () => {
    const object = parseJsonObject(
      JSON.parse('{"name":"plugin","count":2}'),
      "test object"
    );

    expect(object.get("name")).toBe("plugin");
    expect(object.get("count")).toBe(2);
  });

  it("parses strings, finite numbers, and arrays", () => {
    expect(parseJsonString("plugin", "name")).toBe("plugin");
    expect(parseJsonNumber(2, "count")).toBe(2);
    expect(parseJsonArray(["plugin", 2], "values")).toStrictEqual([
      "plugin",
      2,
    ]);
  });

  it("rejects values with the wrong JSON shape", () => {
    expect(() => parseJsonObject(null, "object")).toThrow(
      "object must be an object"
    );
    expect(() => parseJsonString(2, "string")).toThrow(
      "string must be a string"
    );
    expect(() => parseJsonNumber("2", "number")).toThrow(
      "number must be a number"
    );
    expect(() => parseJsonArray(JSON.parse("{}"), "array")).toThrow(
      "array must be an array"
    );
  });
});
