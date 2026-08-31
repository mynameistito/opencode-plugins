import { describe, expect, test } from "bun:test";

import type { ProviderError } from "@/errors.ts";
import { ProviderCommandError } from "@/errors/command.ts";
import { ConfigDecodeError } from "@/errors/config-decode.ts";
import { ConfigReadError } from "@/errors/config-read.ts";
import { MissingProviderCredentialsError } from "@/errors/missing-credentials.ts";
import { ProviderRateLimitError } from "@/errors/rate-limit.ts";
import { ProviderResponseDecodeError } from "@/errors/response-decode.ts";
import { ProviderTimeoutError } from "@/errors/timeout.ts";
import { ProviderTransportError } from "@/errors/transport.ts";

const errorTag = (error: ProviderError): string => error._tag;

describe("provider boundary errors", () => {
  test("carry stable provider and operation context", () => {
    const errors: readonly ProviderError[] = [
      new ProviderTransportError({
        operation: "fetch-usage",
        providerID: "codex",
      }),
      new ProviderTimeoutError({
        operation: "fetch-usage",
        providerID: "zai",
        timeoutMs: 1000,
      }),
      new ProviderRateLimitError({
        operation: "fetch-usage",
        providerID: "synthetic",
        retryAfterMs: 5000,
      }),
      new ProviderResponseDecodeError({
        operation: "decode-response",
        providerID: "minimax",
      }),
      new ProviderCommandError({
        exitCode: 1,
        operation: "run-command",
        providerID: "qwen",
      }),
    ];

    expect(errors.map(errorTag)).toEqual([
      "ProviderTransportError",
      "ProviderTimeoutError",
      "ProviderRateLimitError",
      "ProviderResponseDecodeError",
      "ProviderCommandError",
    ]);
    expect(errors.map(({ providerID }) => providerID)).toEqual([
      "codex",
      "zai",
      "synthetic",
      "minimax",
      "qwen",
    ]);
  });

  test("stores only classified safe causes", () => {
    const error = new ProviderTransportError({
      cause: "network",
      operation: "fetch-usage",
      providerID: "codex",
    });

    expect(error.cause).toBe("network");
    expect(String(error)).not.toContain("responseBody");
  });

  test("formats safe, actionable diagnostic messages", () => {
    const errors = [
      new ConfigDecodeError({ cause: "syntax", operation: "parse-jsonc" }),
      new ConfigReadError({
        cause: "filesystem",
        operation: "read-config",
        path: "C:/config.json",
      }),
      new MissingProviderCredentialsError({
        operation: "fetch-usage",
        providerID: "codex",
      }),
      new ProviderCommandError({
        operation: "run-command",
        providerID: "qwen",
      }),
      new ProviderRateLimitError({
        operation: "fetch-usage",
        providerID: "zai",
      }),
      new ProviderResponseDecodeError({
        operation: "decode-response",
        providerID: "opencode-go",
      }),
      new ProviderTimeoutError({
        operation: "fetch-usage",
        providerID: "synthetic",
        timeoutMs: 1000,
      }),
      new ProviderTransportError({
        cause: "unauthorized",
        operation: "fetch-usage",
        providerID: "minimax",
      }),
      new ProviderTransportError({
        cause: "forbidden",
        operation: "fetch-usage",
        providerID: "minimax",
      }),
      new ProviderTransportError({
        operation: "fetch-usage",
        providerID: "minimax",
        status: 500,
      }),
    ];

    expect(errors.map((error) => error.message)).toEqual([
      "",
      "Unable to read usage-limits config at C:/config.json",
      "missing Codex auth",
      "provider command failed",
      "provider rate limit reached",
      "invalid OpenCode GO usage",
      "provider operation timed out after 1000ms",
      "provider credentials were rejected",
      "provider access was forbidden",
      "provider request failed (HTTP 500)",
    ]);
  });
});
