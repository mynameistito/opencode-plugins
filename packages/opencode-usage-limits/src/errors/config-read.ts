import { Schema } from "effect";

import { safeCause } from "@/errors-shared.ts";

/** Failure while reading an existing plugin config file. */
// oxlint-disable-next-line unicorn/throw-new-error -- Effect's TaggedError factory creates the error class.
export class ConfigReadError extends Schema.TaggedError<ConfigReadError>()(
  "ConfigReadError",
  {
    ...safeCause,
    operation: Schema.Literal("read-config"),
    path: Schema.String,
  }
) {
  override get message(): string {
    return `Unable to read usage-limits config at ${this.path}`;
  }
}
