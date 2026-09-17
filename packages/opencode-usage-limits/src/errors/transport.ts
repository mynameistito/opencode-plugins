import { Schema } from "effect";

import { providerContext, safeCause } from "@/errors-shared.ts";

const taggedError = Schema.TaggedError;

/** Provider transport failure without unsafe response content. */
export class ProviderTransportError extends taggedError<ProviderTransportError>()(
  "ProviderTransportError",
  {
    ...providerContext,
    ...safeCause,
    status: Schema.optionalKey(Schema.Int),
  }
) {
  override get message(): string {
    if (this.cause === "unauthorized") {
      return "provider credentials were rejected";
    }
    if (this.cause === "forbidden") {
      return "provider access was forbidden";
    }
    return this.status === undefined
      ? "provider request failed"
      : `provider request failed (HTTP ${this.status})`;
  }
}
