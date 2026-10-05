import { Clock, Effect, Redacted, Result } from "effect";

import {
  MissingProviderCredentialsError,
  ProviderResponseDecodeError,
} from "@/errors.ts";
import { readProviderAuthFileCredential } from "@/providers/auth-file.ts";
import type { ProviderDefinition } from "@/providers/definition.ts";
import { isJsonNumber, isJsonString } from "@/providers/json.ts";
import { ProviderEnvironment } from "@/providers/runtime/environment.ts";
import { ProviderHttpClient } from "@/providers/runtime/http.ts";
import { ProviderRuntimeLive } from "@/providers/runtime/index.ts";
import type {
  OpenCodeAuth,
  OpenRouterProviderConfig,
  ProviderUsage,
  UsageWindow,
} from "@/types.ts";
import {
  countQuota,
  parseUsageCount,
  parseUsagePercentage,
  unknownQuota,
} from "@/usage.ts";
import type { QuotaCount } from "@/usage.ts";
import { isRecord } from "@/utils.ts";
import type { JsonObject, JsonValue } from "@/utils.ts";
import { resolveHttpsBaseUrl } from "@/utils/url.ts";

const OFFICIAL_ORIGIN = "https://openrouter.ai";
const KEY_PATH = "/api/v1/key";
const PROVIDER_ID = "openrouter" as const;
type CredentialInput = JsonValue | Redacted.Redacted<string> | undefined;

interface KeyLimit {
  readonly limit: QuotaCount;
  readonly remaining: QuotaCount;
  readonly resetKind: UsageWindow["kind"];
}

const keyFromAuth = (
  value: JsonObject,
  credential: (
    value: JsonValue | undefined
  ) => Redacted.Redacted<string> | undefined
): Redacted.Redacted<string> | undefined => {
  const entry = isRecord(value.openrouter) ? value.openrouter : value;
  return credential(entry.key) ?? credential(entry.apiKey);
};

const keyFromOpenCodeAuth = (
  value: OpenCodeAuth,
  credential: (value: CredentialInput) => Redacted.Redacted<string> | undefined
): Redacted.Redacted<string> | undefined => {
  if (!isRecord(value) || !isRecord(value.openrouter)) {
    return undefined;
  }
  return (
    credential(value.openrouter.key) ?? credential(value.openrouter.apiKey)
  );
};

const resetKind = (value: JsonValue | undefined): UsageWindow["kind"] => {
  if (!isJsonString(value)) {
    return "credits";
  }
  switch (value) {
    case "daily":
    case "weekly":
    case "monthly": {
      return value;
    }
    default: {
      return "credits";
    }
  }
};

const optionalLimitNumber = (
  value: JsonValue | undefined
): QuotaCount | null | undefined => {
  if (value === undefined || value === null) {
    return value;
  }
  if (!isJsonNumber(value) || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  const parsed = parseUsageCount(value);
  return Result.isSuccess(parsed) ? parsed.success : undefined;
};

const parseKeyLimit = (value: JsonObject): KeyLimit | null | undefined => {
  const limit = optionalLimitNumber(value.limit);
  const remaining = optionalLimitNumber(value.limit_remaining);
  const invalidLimit =
    value.limit !== undefined && value.limit !== null && limit === undefined;
  const invalidRemaining =
    value.limit_remaining !== undefined &&
    value.limit_remaining !== null &&
    remaining === undefined;
  if (invalidLimit || invalidRemaining) {
    return undefined;
  }
  if (limit === undefined || limit === null || limit === 0) {
    return null;
  }
  if (remaining === undefined || remaining === null) {
    return null;
  }
  return {
    limit,
    remaining: Result.getOrThrow(parseUsageCount(Math.min(limit, remaining))),
    resetKind: resetKind(value.limit_reset),
  };
};

const keyLimitWindow = (keyLimit: KeyLimit | null): UsageWindow => {
  if (keyLimit === null) {
    return {
      kind: "credits",
      label: "spend limit",
      quota: unknownQuota,
      resetsAt: null,
    };
  }
  const current = Result.getOrThrow(
    parseUsageCount(keyLimit.limit - keyLimit.remaining)
  );
  const percentage = Result.getOrThrow(
    parseUsagePercentage((current / keyLimit.limit) * 100)
  );
  return {
    kind: keyLimit.resetKind,
    label: "spend",
    quota: countQuota(current, keyLimit.limit, percentage, "USD"),
    resetsAt: null,
  };
};

const keyUrl = (baseUrl: string): string => {
  const url = new URL(baseUrl);
  url.pathname = KEY_PATH;
  url.search = "";
  url.hash = "";
  return url.toString();
};

const fetchOpenRouterUsageEffect = (
  config: OpenRouterProviderConfig | undefined,
  openCodeAuth: OpenCodeAuth,
  timeoutMs: number
): ReturnType<ProviderDefinition<"openrouter">["fetch"]> =>
  Effect.gen(function* runFetchOpenRouterUsage() {
    const environment = yield* ProviderEnvironment;
    const http = yield* ProviderHttpClient;
    const baseUrl = resolveHttpsBaseUrl(config?.baseUrl, OFFICIAL_ORIGIN);
    const isOfficialOrigin = new URL(baseUrl).origin === OFFICIAL_ORIGIN;
    const authFileKey = yield* readProviderAuthFileCredential(
      config?.authPath,
      PROVIDER_ID,
      keyFromAuth
    );
    const configuredKey = environment.resolveCredential(config?.apiKey);
    const openCodeKey = isRecord(openCodeAuth)
      ? keyFromOpenCodeAuth(openCodeAuth, environment.credential)
      : undefined;
    const apiKey =
      authFileKey ??
      (isOfficialOrigin ? (openCodeKey ?? configuredKey) : configuredKey);
    if (!apiKey) {
      return yield* new MissingProviderCredentialsError({
        operation: "fetch-usage",
        providerID: PROVIDER_ID,
      });
    }

    const payload = yield* http.requestJson({
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${Redacted.value(apiKey)}`,
      },
      method: "GET",
      providerID: PROVIDER_ID,
      timeoutMs,
      url: keyUrl(baseUrl),
    });
    const data =
      isRecord(payload) && isRecord(payload.data) ? payload.data : null;
    const parsed = data ? parseKeyLimit(data) : undefined;
    if (parsed === undefined) {
      return yield* new ProviderResponseDecodeError({
        cause: "schema",
        operation: "decode-response",
        providerID: PROVIDER_ID,
      });
    }

    return {
      capturedAt: new Date(yield* Clock.currentTimeMillis),
      id: PROVIDER_ID,
      label: config?.label ?? "OpenRouter",
      windows: [keyLimitWindow(parsed)],
    };
  });

/** Fetches OpenRouter key spending-limit usage from its documented current-key API. */
export const fetchOpenRouterUsage = (
  config: OpenRouterProviderConfig | undefined,
  openCodeAuth: OpenCodeAuth,
  timeoutMs: number
): Promise<ProviderUsage<"openrouter">> =>
  Effect.runPromise(
    fetchOpenRouterUsageEffect(config, openCodeAuth, timeoutMs).pipe(
      Effect.provide(ProviderRuntimeLive)
    )
  );

/** OpenRouter key spending-limit adapter and OpenCode provider mapping. */
export const openRouterProvider = {
  defaultLabel: "OpenRouter",
  displayOrder: 10,
  fetch: fetchOpenRouterUsageEffect,
  footerWindowKind: "credits",
  id: PROVIDER_ID,
  openCodeProviderIDs: [PROVIDER_ID],
} as const satisfies ProviderDefinition<"openrouter">;
