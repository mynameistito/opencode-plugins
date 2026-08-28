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
export const authorized = (
  request: Request,
  expected: string | undefined
): boolean => {
  if (!expected) {
    return false;
  }
  const value = request.headers.get("Authorization");
  return (
    value !== null && value.startsWith("Bearer ") && value.slice(7) === expected
  );
};
