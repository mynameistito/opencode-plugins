import { expect, test } from "bun:test";

import { decodeBase64Url, encodeBase64Url } from "../src/base64url.ts";
import { resolveConfig } from "../src/config.ts";
import { expiryAt, parseExpiry } from "../src/expiry.ts";
import { shareUrl } from "../src/url.ts";

test("base64url round trip", () => {
  const bytes = new TextEncoder().encode("hello?/+");
  expect(
    new TextDecoder().decode(decodeBase64Url(encodeBase64Url(bytes)))
  ).toBe("hello?/+");
});
test("constructs fragment-only URL", () =>
  expect(shareUrl("https://host/", "abc", "key")).toBe(
    "https://host/s/abc#key"
  ));
test("parses expiry", () => {
  expect(parseExpiry("7d")).toBe(604_800_000);
  expect(expiryAt("0d")).toBeUndefined();
});
test("resolves configuration", () =>
  expect(resolveConfig({ sanitize: false }).sanitize).toBe(false));
test("only accepts HTTPS Worker origins", () => {
  const httpEndpoint = ["http", "://host"].join("");
  const ftpEndpoint = ["ftp", "://host"].join("");
  expect(resolveConfig({ endpoint: httpEndpoint }).endpoint).toBe("");
  expect(resolveConfig({ endpoint: ftpEndpoint }).endpoint).toBe("");
  expect(resolveConfig({ endpoint: "https://host/path" }).endpoint).toBe(
    "https://host"
  );
});
