/** Encode bytes using URL-safe base64 without padding. */
export const encodeBase64Url = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString("base64url");

/** Decode URL-safe base64 into bytes. */
export const decodeBase64Url = (value: string): Uint8Array =>
  new Uint8Array(Buffer.from(value, "base64url"));
