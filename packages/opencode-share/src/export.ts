import type { SessionMessageInfo } from "@opencode-ai/client";

// Session messages are sanitized recursively at the serialization boundary.
// oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-unsafe-dictionary-type, anti-slop/no-known-value-widening

const SENSITIVE_KEY =
  /(?<sensitive>token|secret|password|authorization|api[-_]?key|cookie)/iu;

const sanitizeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    result[key] = SENSITIVE_KEY.test(key) ? "[REDACTED]" : sanitizeValue(item);
  }
  return result;
};

/** Serialize the installed beta's typed session messages for local encryption. */
export const serializeSession = (
  messages: readonly SessionMessageInfo[],
  sanitize: boolean
): string =>
  JSON.stringify({
    exportedAt: Date.now(),
    kind: "opencode-session",
    messages: sanitize ? sanitizeValue(messages) : messages,
    version: 2,
  });
