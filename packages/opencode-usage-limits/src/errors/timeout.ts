import {
  NonNegativeFiniteSchema,
  providerContext,
  safeCause,
  schemaTaggedError,
} from "@/errors-shared.ts";

/** Provider operation exceeded its configured timeout. */
export class ProviderTimeoutError extends schemaTaggedError<ProviderTimeoutError>()(
  "ProviderTimeoutError",
  { ...providerContext, ...safeCause, timeoutMs: NonNegativeFiniteSchema }
) {
  override get message(): string {
    return `provider operation timed out after ${this.timeoutMs}ms`;
  }
}
