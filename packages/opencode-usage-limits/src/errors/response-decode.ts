import {
  providerContext,
  safeCause,
  schemaTaggedError,
} from "@/errors-shared.ts";

/** Provider returned a payload that could not be decoded safely. */
export class ProviderResponseDecodeError extends schemaTaggedError<ProviderResponseDecodeError>()(
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
      commandcode: "Command Code",
      deepseek: "DeepSeek",
      minimax: "MiniMax",
      "novita-ai": "Novita AI",
      "opencode-go": "OpenCode GO",
      openrouter: "OpenRouter",
      qwen: "Qwen",
      synthetic: "Synthetic",
      zai: "ZAI",
    } as const;
    return `invalid ${labels[this.providerID]} usage`;
  }
}
