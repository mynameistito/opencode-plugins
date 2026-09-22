import { Schema } from "effect";

export const schemaTaggedError = Schema.TaggedError;

export const ProviderIDSchema = Schema.Literals([
  "codex",
  "zai",
  "synthetic",
  "minimax",
  "qwen",
  "alibaba-token-plan",
  "opencode-go",
]);

export const credentialMessages = {
  "alibaba-token-plan": "missing Bailian console login",
  codex: "missing Codex auth",
  minimax: "missing MiniMax key",
  "opencode-go": "missing OpenCode GO key",
  qwen: "missing Qwen credentials",
  synthetic: "missing Synthetic key",
  zai: "missing ZAI key",
} as const;

export const ProviderOperationSchema = Schema.Literals([
  "decode-response",
  "fetch-usage",
  "read-auth",
  "run-command",
]);

export const NonNegativeFiniteSchema = Schema.Finite.check(
  Schema.isGreaterThanOrEqualTo(0)
);

export const safeCause = {
  cause: Schema.optionalKey(
    Schema.Literals([
      "command",
      "decode",
      "filesystem",
      "forbidden",
      "http",
      "invalid-version",
      "network",
      "output-limit",
      "rate-limit",
      "schema",
      "syntax",
      "timeout",
      "unauthorized",
      "unsupported",
      "unknown",
    ])
  ),
};

export const providerContext = {
  operation: ProviderOperationSchema,
  providerID: ProviderIDSchema,
};
