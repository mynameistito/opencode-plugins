import assert from "node:assert/strict";

/** A JSON value projected into a recursive TypeScript representation. */
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | JsonObject;

/** A JSON object whose members retain their recursive JSON value types. */
export type JsonObject = ReadonlyMap<string, JsonValue>;

/** Read an optional JSON object member, normalizing absent members to null. */
export const getJsonField = (object: JsonObject, key: string): JsonValue =>
  object.get(key) ?? null;

/** Parse a JSON value as a plain object. */
export const parseJsonObject = (
  value: JsonValue,
  context: string
): JsonObject => {
  assert.notEqual(value, null, `${context} must be an object`);
  const object = new Object(value);
  assert.equal(
    Object.getPrototypeOf(object),
    Object.prototype,
    `${context} must be an object`
  );

  const result = new Map<string, JsonValue>();
  for (const [key, entry] of Object.entries(object)) {
    result.set(key, entry);
  }
  return result;
};

/** Parse a JSON value as a string. */
export const parseJsonString = (value: JsonValue, context: string): string => {
  assert.equal(
    Object.prototype.toString.call(value),
    "[object String]",
    `${context} must be a string`
  );
  return String(value);
};

/** Parse a JSON value as a finite number. */
export const parseJsonNumber = (value: JsonValue, context: string): number => {
  assert.equal(
    Object.prototype.toString.call(value),
    "[object Number]",
    `${context} must be a number`
  );
  const number = Number(value);
  assert.ok(Number.isFinite(number), `${context} must be finite`);
  return number;
};

/** Parse a JSON value as an array. */
export const parseJsonArray = (
  value: JsonValue,
  context: string
): JsonValue[] => {
  assert.ok(Array.isArray(value), `${context} must be an array`);
  return value;
};
