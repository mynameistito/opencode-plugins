import { decodeBase64Url, encodeBase64Url } from "./base64url.ts";

const bufferSource = (bytes: Uint8Array): ArrayBuffer =>
  // SAFETY: copying creates an owned, non-shared ArrayBuffer for Web Crypto.
  Uint8Array.from(bytes).buffer as ArrayBuffer;

/** Encrypted payload sent to the Worker. */
export interface EncryptedPayload {
  readonly iv: string;
  readonly ciphertext: string;
  readonly version: 1;
}

/** Encrypt UTF-8 plaintext with a random AES-GCM key. */
export const encrypt = async (
  plaintext: string
): Promise<{ readonly key: string; readonly payload: EncryptedPayload }> => {
  const key = await crypto.subtle.generateKey(
    { length: 256, name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt(
    { iv: bufferSource(iv), name: "AES-GCM" },
    key,
    bufferSource(encoded)
  );
  return {
    key: encodeBase64Url(
      new Uint8Array(await crypto.subtle.exportKey("raw", key))
    ),
    payload: {
      ciphertext: encodeBase64Url(new Uint8Array(ciphertext)),
      iv: encodeBase64Url(iv),
      version: 1,
    },
  };
};

/** Decrypt an encrypted payload with a URL-fragment key. */
export const decrypt = async (
  keyValue: string,
  payload: EncryptedPayload
): Promise<string> => {
  const key = await crypto.subtle.importKey(
    "raw",
    bufferSource(decodeBase64Url(keyValue)),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  const plaintext = await crypto.subtle.decrypt(
    { iv: bufferSource(decodeBase64Url(payload.iv)), name: "AES-GCM" },
    key,
    bufferSource(decodeBase64Url(payload.ciphertext))
  );
  return new TextDecoder().decode(plaintext);
};
