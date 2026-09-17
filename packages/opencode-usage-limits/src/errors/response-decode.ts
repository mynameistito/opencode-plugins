import { Schema } from "effect";

import { providerContext, safeCause } from "@/errors-shared.ts";

const taggedError = Schema.TaggedError;

/** Provider returned a payload that could not be decoded safely. */
export class ProviderResponseDecodeError extends taggedError<ProviderResponseDecodeError>()(
  "ProviderResponseDecodeError",
  {
    ...providerContext,
    ...safeCause,
  }
) {
  override get message(): string {
    if (this.cause === "unsupported") {
      return "Bailian CLI >= 1.15.0 is required for Alibaba Token Plan usage";
    }
    if (this.cause === "invalid-version") {
      return "could not determine the Bailian CLI version; install Bailian CLI >= 1.15.0";
    }
    const labels = {
      "alibaba-token-plan": "Alibaba Token Plan",
      codex: "Codex",
      minimax: "MiniMax",
      "opencode-go": "OpenCode GO",
      qwen: "Qwen",
      synthetic: "Synthetic",
      zai: "ZAI",
    } as const;
    return `invalid ${labels[this.providerID]} usage`;
  }
}
