import { Schema } from "effect";

import { safeCause } from "@/errors-shared.ts";

/** Failure while parsing JSONC or decoding plugin config fields. */
// oxlint-disable-next-line unicorn/throw-new-error -- Effect's TaggedError factory creates the error class.
export class ConfigDecodeError extends Schema.TaggedError<ConfigDecodeError>()(
  "ConfigDecodeError",
  {
    ...safeCause,
    operation: Schema.Literals(["parse-jsonc", "parse-config"]),
  }
) {}
