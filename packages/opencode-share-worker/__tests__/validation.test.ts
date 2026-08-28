import { expect, test } from "bun:test";

import { authorized, parseCreateInput } from "../src/validation";

const input = {
  expiresAt: 100_000,
  id: "abcdefghijklmnopqrst",
  payload: { ciphertext: "abcdefghijklmnop", iv: "abcdefghijkl", version: 1 },
} as const;
test("validates worker request shape", () => {
  expect(parseCreateInput(input, 0, 1000)).toEqual(input);
  expect(parseCreateInput({ ...input, id: "bad" }, 0, 1000)).toBe("invalid_id");
});
test("rejects oversized and expired requests", () => {
  expect(parseCreateInput({ ...input, expiresAt: 0 }, 0, 1000)).toBe(
    "invalid_expiry"
  );
  expect(parseCreateInput(input, 0, 10)).toBe("payload_too_large");
});
test("checks bearer authorization", async () => {
  const request = new Request("https://host", {
    headers: { Authorization: "Bearer secret" },
  });
  expect(await authorized(request, "secret")).toBe(true);
  expect(await authorized(request, "other")).toBe(false);
});
