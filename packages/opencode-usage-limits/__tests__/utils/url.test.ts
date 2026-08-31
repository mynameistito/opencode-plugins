import { describe, expect, test } from "bun:test";

import { resolveHttpsBaseUrl } from "@/utils/url.ts";

describe("resolveHttpsBaseUrl", () => {
  const fallback = "https://api.example.test/";

  test("resolves direct HTTPS URLs without a trailing slash", () => {
    expect(
      resolveHttpsBaseUrl(" https://usage.example.test/v1/ ", fallback)
    ).toBe("https://usage.example.test/v1");
  });

  test.each([
    ["http://localhost:8787/", "http://localhost:8787"],
    ["http://127.0.0.1:8787/", "http://127.0.0.1:8787"],
    ["http://[::1]:8787/", "http://[::1]:8787"],
    ["http://usage.example.test", "https://api.example.test"],
    ["https://token@example.test", "https://api.example.test"],
    ["not a URL", "https://api.example.test"],
  ])("resolves %s to %s", (configured, expected) => {
    expect(resolveHttpsBaseUrl(configured, fallback)).toBe(expected);
  });
});
