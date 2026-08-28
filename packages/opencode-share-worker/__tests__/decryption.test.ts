import { expect, test } from "bun:test";

import { encrypt } from "../../opencode-share/src/crypto";
import { decryptPayload } from "../src/decryption";

// oxlint-disable eslint/sort-keys

test("decrypts payloads produced by the share plugin", async () => {
  const encrypted = await encrypt(
    JSON.stringify([{ id: "m1", text: "hello", type: "user" }])
  );
  await expect(
    decryptPayload(encrypted.key, encrypted.payload)
  ).resolves.toEqual([{ id: "m1", text: "hello", type: "user" }]);
});

test("rejects a wrong key without exposing plaintext", async () => {
  const encrypted = await encrypt("private");
  await expect(
    decryptPayload(`${encrypted.key.slice(0, -1)}A`, encrypted.payload)
  ).rejects.toThrow("decrypt_failure");
});
