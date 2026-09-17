import { Schema } from "effect";

import { providerContext, safeCause } from "@/errors-shared.ts";

/** Provider subprocess command failed without exposing stdout or stderr. */
// oxlint-disable-next-line unicorn/throw-new-error -- Effect's TaggedError factory creates the error class.
export class ProviderCommandError extends Schema.TaggedError<ProviderCommandError>()(
  "ProviderCommandError",
  {
    ...providerContext,
    ...safeCause,
    exitCode: Schema.optionalKey(Schema.Int),
  }
) {
  override get message(): string {
    return this.exitCode === undefined
      ? "provider command failed"
      : `provider command failed (exit code ${this.exitCode})`;
  }
}
