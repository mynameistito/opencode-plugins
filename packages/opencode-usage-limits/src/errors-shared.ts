import { Schema } from "effect";

/** Factory for schema-validated tagged error classes used at plugin boundaries. */
export const schemaTaggedError = Schema.TaggedError;

/** Schema for the provider identifiers accepted in structured errors. */
export const ProviderIDSchema = Schema.Literals([
  "codex",
  "zai",
  "synthetic",
  "minimax",
  "qwen",
  "alibaba-token-plan",
  "opencode-go",
  "commandcode",
]);

/** Safe, user-facing missing-credential message for each provider. */
export const credentialMessages = {
  "alibaba-token-plan": "missing Bailian console login",
  codex: "missing Codex auth",
  commandcode: "missing Command Code key",
  minimax: "missing MiniMax key",
  "opencode-go": "missing OpenCode GO key",
  qwen: "missing Qwen credentials",
  synthetic: "missing Synthetic key",
  zai: "missing ZAI key",
} as const;

/** Schema for operations that can fail at provider boundaries. */
export const ProviderOperationSchema = Schema.Literals([
  "decode-response",
  "fetch-usage",
  "read-auth",
  "run-command",
]);

/** Schema for finite numeric values greater than or equal to zero. */
export const NonNegativeFiniteSchema = Schema.Finite.check(
  Schema.isGreaterThanOrEqualTo(0)
);

/** Common allow-listed failure causes for structured provider errors. */
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

/** Shared provider and operation fields for provider errors. */
export const providerContext = {
  operation: ProviderOperationSchema,
  providerID: ProviderIDSchema,
};
