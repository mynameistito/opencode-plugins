import { expect, test } from "bun:test";

import { decrypt, encrypt } from "../src/crypto.ts";

test("encrypt/decrypt round trip", async () => {
  const value = await encrypt("private transcript");
  expect(await decrypt(value.key, value.payload)).toBe("private transcript");
});
