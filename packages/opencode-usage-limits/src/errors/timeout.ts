import { Schema } from "effect";

import {
  NonNegativeFiniteSchema,
  providerContext,
  safeCause,
} from "@/errors-shared.ts";

/** Provider operation exceeded its configured timeout. */
// oxlint-disable-next-line unicorn/throw-new-error -- Effect's TaggedError factory creates the error class.
export class ProviderTimeoutError extends Schema.TaggedError<ProviderTimeoutError>()(
  "ProviderTimeoutError",
  { ...providerContext, ...safeCause, timeoutMs: NonNegativeFiniteSchema }
) {
  override get message(): string {
    return `provider operation timed out after ${this.timeoutMs}ms`;
  }
}
