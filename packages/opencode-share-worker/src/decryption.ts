// oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion
/** Decrypts the Worker payload entirely in the browser. */
const decode = (value: string): Uint8Array => {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("invalid_payload");
  }
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Uint8Array.from(
    atob(padded),
    (character) => character.codePointAt(0) ?? 0
  );
};
const ownedBuffer = (bytes: Uint8Array): ArrayBuffer =>
  // SAFETY: copying produces an owned ArrayBuffer accepted by all Web Crypto typings.
  Uint8Array.from(bytes).buffer as ArrayBuffer;

export const decryptPayload = async (
  keyValue: string,
  payload: unknown
): Promise<unknown> => {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new Error("invalid_payload");
  }
  // SAFETY: the object/array check above establishes a JSON object boundary.
  const record = payload as Record<string, unknown>;
  if (
    record.version !== 1 ||
    typeof record.iv !== "string" ||
    typeof record.ciphertext !== "string"
  ) {
    throw new Error("invalid_payload");
  }
  const keyBytes = decode(keyValue);
  if (keyBytes.byteLength !== 32) {
    throw new Error("invalid_key");
  }
  let plaintext: ArrayBuffer;
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      ownedBuffer(keyBytes),
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );
    plaintext = await crypto.subtle.decrypt(
      { iv: ownedBuffer(decode(record.iv)), name: "AES-GCM" },
      key,
      ownedBuffer(decode(record.ciphertext))
    );
  } catch {
    throw new Error("decrypt_failure");
  }
  try {
    return JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
  } catch {
    throw new Error("invalid_encrypted_payload");
  }
};
