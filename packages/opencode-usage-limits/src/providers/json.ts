import { Schema } from "effect";

import type { JsonValue } from "@/utils.ts";

const JsonNumber = Schema.Number;
const JsonString = Schema.String;
const JsonBoolean = Schema.Boolean;

/** Narrows a JSON value to a number. */
export const isJsonNumber = (value: JsonValue | undefined): value is number =>
  Schema.is(JsonNumber)(value);

/** Narrows a JSON value to a string. */
export const isJsonString = (value: JsonValue | undefined): value is string =>
  Schema.is(JsonString)(value);

/** Narrows a JSON value to a boolean. */
export const isJsonBoolean = (value: JsonValue | undefined): value is boolean =>
  Schema.is(JsonBoolean)(value);
