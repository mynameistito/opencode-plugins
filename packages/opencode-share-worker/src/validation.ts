export type JsonValue =
  | boolean
  | null
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };
interface JsonObject {
  readonly [key: string]: JsonValue;
}

interface Payload {
  readonly version: 1;
  readonly iv: string;
  readonly ciphertext: string;
}
interface TimingSafeSubtleCrypto extends SubtleCrypto {
  timingSafeEqual: (first: BufferSource, second: BufferSource) => boolean;
}
export interface CreateInput {
  readonly id: string;
  readonly expiresAt: number;
  readonly payload: Payload;
}
export type ValidationError =
  | "invalid_json"
  | "invalid_content_type"
  | "payload_too_large"
  | "invalid_shape"
  | "invalid_id"
  | "invalid_expiry";
const ID = /^[A-Za-z0-9_-]{20,96}$/u;
const B64 = /^[A-Za-z0-9_-]+$/u;
const isObject = (value: JsonValue | undefined): value is JsonObject =>
  Object.prototype.toString.call(value) === "[object Object]";
const isString = (value: JsonValue | undefined): value is string =>
  Object.prototype.toString.call(value) === "[object String]";
const isNumber = (value: JsonValue | undefined): value is number =>
  Object.prototype.toString.call(value) === "[object Number]";

const parsePayload = (value: JsonValue | undefined): Payload | undefined => {
  if (!isObject(value)) {
    return undefined;
  }
  const { ciphertext, iv, version } = value;
  if (version !== 1 || !isString(iv) || !isString(ciphertext)) {
    return undefined;
  }
  if (!B64.test(iv) || !B64.test(ciphertext)) {
    return undefined;
  }
  if (iv.length < 8 || ciphertext.length < 16) {
    return undefined;
  }
  return { ciphertext, iv, version: 1 };
};

/** Parse a creation request at the HTTP boundary. */
export const parseCreateInput = (
  value: JsonValue,
  now: number,
  maxBytes: number
): CreateInput | ValidationError => {
  if (!isObject(value)) {
    return "invalid_shape";
  }
  const record = value;
  const { payload } = record;
  if (!isString(record.id) || !ID.test(record.id)) {
    return "invalid_id";
  }
  if (
    !isNumber(record.expiresAt) ||
    !Number.isInteger(record.expiresAt) ||
    record.expiresAt <= now ||
    record.expiresAt > now + 31 * 86_400_000
  ) {
    return "invalid_expiry";
  }
  const parsedPayload = parsePayload(payload);
  if (!parsedPayload) {
    return "invalid_shape";
  }
  if (new TextEncoder().encode(JSON.stringify(value)).byteLength > maxBytes) {
    return "payload_too_large";
  }
  return {
    expiresAt: record.expiresAt,
    id: record.id,
    payload: parsedPayload,
  };
};

/** Check a bearer token without exposing it in diagnostics. */
export const authorized = async (
  request: Request,
  expected: string | undefined
): Promise<boolean> => {
  if (!expected) {
    return false;
  }
  const value = request.headers.get("Authorization");
  if (value === null || !value.startsWith("Bearer ")) {
    return false;
  }
  const encoder = new TextEncoder();
  const [actualDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(value.slice(7))),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  // SAFETY: Cloudflare Workers extends SubtleCrypto with timingSafeEqual.
  const subtle = crypto.subtle as Partial<TimingSafeSubtleCrypto>;
  if (subtle.timingSafeEqual) {
    return subtle.timingSafeEqual(actualDigest, expectedDigest);
  }
  const actual = new Uint8Array(actualDigest);
  const expectedBytes = new Uint8Array(expectedDigest);
  let difference = Math.abs(actual.length - expectedBytes.length);
  for (let index = 0; index < actual.length; index += 1) {
    difference += Math.abs((actual[index] ?? 0) - (expectedBytes[index] ?? 0));
  }
  return difference === 0;
};
