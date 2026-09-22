import { Schema } from "effect";

import { safeCause, schemaTaggedError } from "@/errors-shared.ts";

/** Failure while parsing JSONC or decoding plugin config fields. */
export class ConfigDecodeError extends schemaTaggedError<ConfigDecodeError>()(
  "ConfigDecodeError",
  {
    ...safeCause,
    operation: Schema.Literals(["parse-jsonc", "parse-config"]),
  }
) {}
