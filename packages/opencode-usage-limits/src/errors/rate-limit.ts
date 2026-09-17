import { Schema } from "effect";

import { NonNegativeFiniteSchema, providerContext } from "@/errors-shared.ts";

/** Provider rejected a request because its rate limit was reached. */
// oxlint-disable-next-line unicorn/throw-new-error -- Effect's TaggedError factory creates the error class.
export class ProviderRateLimitError extends Schema.TaggedError<ProviderRateLimitError>()(
  "ProviderRateLimitError",
  {
    ...providerContext,
    retryAfterMs: Schema.optionalKey(NonNegativeFiniteSchema),
  }
) {
  override get message(): string {
    return this.retryAfterMs === undefined
      ? "provider rate limit reached"
      : `provider rate limit reached; retry after ${this.retryAfterMs}ms`;
  }
}
