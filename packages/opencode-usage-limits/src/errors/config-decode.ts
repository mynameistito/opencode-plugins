import { Schema } from "effect";

import { safeCause } from "@/errors-shared.ts";

const taggedError = Schema.TaggedError;

/** Failure while parsing JSONC or decoding plugin config fields. */
export class ConfigDecodeError extends taggedError<ConfigDecodeError>()(
  "ConfigDecodeError",
  {
    ...safeCause,
    operation: Schema.Literals(["parse-jsonc", "parse-config"]),
  }
) {}
