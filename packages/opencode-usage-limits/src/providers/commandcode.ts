import { Clock, Effect, Redacted, Result } from "effect";

import {
  MissingProviderCredentialsError,
  ProviderResponseDecodeError,
} from "@/errors.ts";
import { readProviderAuthFileCredential } from "@/providers/auth-file.ts";
import type { ProviderDefinition } from "@/providers/definition.ts";
import { isJsonBoolean, isJsonString } from "@/providers/json.ts";
import { ProviderEnvironment } from "@/providers/runtime/environment.ts";
import { ProviderHttpClient } from "@/providers/runtime/http.ts";
import { ProviderRuntimeLive } from "@/providers/runtime/index.ts";
import type {
  CommandCodeProviderConfig,
  OpenCodeAuth,
  ProviderUsage,
  UsageWindow,
} from "@/types.ts";
import {
  parseUsageCount,
  parseUsagePercentage,
  percentageQuota,
  resetInstantOrNull,
  unknownQuota,
} from "@/usage.ts";
import { isRecord } from "@/utils.ts";
import type { JsonObject, JsonValue } from "@/utils.ts";
import { resolveHttpsBaseUrl } from "@/utils/url.ts";

const DEFAULT_BASE_URL = "https://api.commandcode.ai";
const WHOAMI_PATH = "/alpha/whoami";
const CREDITS_PATH = "/alpha/billing/credits";
const SUMMARY_PATH = "/alpha/usage/summary";
const PROVIDER_ID = "commandcode" as const;

const commandCodeUrl = (
  baseUrl: string,
  endpoint: string,
  query: Readonly<Record<string, string | undefined>> = {}
): string => {
  const url = new URL(baseUrl);
  let { pathname } = url;
  while (pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }
  url.pathname = `${pathname}${endpoint}`;
  url.hash = "";
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
};

const keyFromAuth = (
  value: JsonObject,
  credential: (
    value: JsonValue | undefined
  ) => Redacted.Redacted<string> | undefined
): Redacted.Redacted<string> | undefined => {
  const directKey = credential(value.key);
  const directApiKey = credential(value.apiKey);
  if (directKey ?? directApiKey) {
    return directKey ?? directApiKey;
  }
  const entry = value.commandcode;
  if (isRecord(entry)) {
    return credential(entry.key) ?? credential(entry.apiKey);
  }
  return undefined;
};

const orgIdFromWhoami = (payload: JsonObject): string | undefined => {
  const scope = isRecord(payload.data) ? payload.data : payload;
  const org = isRecord(scope.org) ? scope.org : scope.organization;
  if (!isRecord(org) || !isJsonString(org.id) || org.id.trim() === "") {
    return undefined;
  }
  return org.id;
};

const whoamiReportsFailure = (payload: JsonObject): boolean => {
  if (isJsonBoolean(payload.success) && !payload.success) {
    return true;
  }
  return (
    isRecord(payload.data) &&
    isJsonBoolean(payload.data.success) &&
    !payload.data.success
  );
};

const decodeFailure = () =>
  new ProviderResponseDecodeError({
    cause: "schema",
    operation: "decode-response",
    providerID: PROVIDER_ID,
  });

const resetFromEpochMs = (value: JsonValue | undefined) => {
  const parsed = parseUsageCount(value);
  return Result.isFailure(parsed)
    ? null
    : resetInstantOrNull(new Date(parsed.success));
};

const commandCodeWindow = (
  value: JsonValue | undefined,
  kind: UsageWindow["kind"],
  label: string
): UsageWindow | null => {
  if (!isRecord(value)) {
    return null;
  }
  const used = parseUsageCount(value.used);
  const cap = parseUsageCount(value.cap);
  if (Result.isFailure(used) || Result.isFailure(cap) || cap.success <= 0) {
    return null;
  }
  return {
    kind,
    label,
    quota: percentageQuota(
      Result.getOrThrow(
        parseUsagePercentage(Math.min((used.success / cap.success) * 100, 100))
      )
    ),
    resetsAt: resetFromEpochMs(value.resetAt),
  };
};

const summarySpentCredits = (payload: JsonValue | null): number | null => {
  if (!isRecord(payload)) {
    return null;
  }
  const spent = parseUsageCount(payload.totalCredits ?? payload.totalCost);
  return Result.isFailure(spent) ? null : spent.success;
};

const commandCodeMonthlyWindow = (
  credits: JsonValue | undefined,
  spent: number | null
): UsageWindow | null => {
  if (!isRecord(credits)) {
    return null;
  }
  const monthly = parseUsageCount(credits.monthlyCredits);
  const purchased = parseUsageCount(credits.purchasedCredits);
  const free = parseUsageCount(credits.freeCredits);
  if (
    Result.isFailure(monthly) ||
    Result.isFailure(purchased) ||
    Result.isFailure(free)
  ) {
    return null;
  }
  if (spent === null) {
    return {
      kind: "monthly",
      label: "monthly",
      quota: unknownQuota,
      resetsAt: null,
    };
  }
  const total = monthly.success + purchased.success + free.success + spent;
  if (total <= 0) {
    return null;
  }
  return {
    kind: "monthly",
    label: "monthly",
    quota: percentageQuota(
      Result.getOrThrow(parseUsagePercentage((spent / total) * 100))
    ),
    resetsAt: null,
  };
};

const fetchCommandCodeUsageEffect = (
  config: CommandCodeProviderConfig | undefined,
  openCodeAuth: OpenCodeAuth | null,
  timeoutMs: number
): ReturnType<ProviderDefinition<"commandcode">["fetch"]> =>
  Effect.gen(function* runFetchCommandCodeUsage() {
    const environment = yield* ProviderEnvironment;
    const http = yield* ProviderHttpClient;
    const baseUrl = resolveHttpsBaseUrl(config?.baseUrl, DEFAULT_BASE_URL);
    const isOfficialBaseUrl = baseUrl === DEFAULT_BASE_URL;
    const authFileKey = yield* readProviderAuthFileCredential(
      config?.authPath,
      PROVIDER_ID,
      keyFromAuth
    );
    const configuredKey = environment.resolveCredential(config?.apiKey);
    const authKey = isRecord(openCodeAuth)
      ? keyFromAuth(openCodeAuth, environment.credential)
      : undefined;
    const apiKey =
      authFileKey ??
      (isOfficialBaseUrl ? (authKey ?? configuredKey) : configuredKey);
    if (!apiKey) {
      return yield* new MissingProviderCredentialsError({
        operation: "fetch-usage",
        providerID: PROVIDER_ID,
      });
    }
    const headers = {
      Accept: "application/json",
      Authorization: `Bearer ${Redacted.value(apiKey)}`,
    };
    const whoami = yield* http.requestJson({
      headers,
      method: "GET",
      providerID: PROVIDER_ID,
      timeoutMs,
      url: commandCodeUrl(baseUrl, WHOAMI_PATH, { limits: "1" }),
    });
    if (!isRecord(whoami) || whoamiReportsFailure(whoami)) {
      return yield* decodeFailure();
    }
    const orgId = orgIdFromWhoami(whoami);
    const payload = yield* http.requestJson({
      headers,
      method: "GET",
      providerID: PROVIDER_ID,
      timeoutMs,
      url: commandCodeUrl(baseUrl, CREDITS_PATH, { orgId }),
    });
    if (!isRecord(payload) || !isRecord(payload.windowLimits)) {
      return yield* decodeFailure();
    }

    const summary = yield* http
      .requestJson({
        headers,
        method: "GET",
        providerID: PROVIDER_ID,
        timeoutMs,
        url: commandCodeUrl(baseUrl, SUMMARY_PATH, { orgId }),
      })
      .pipe(Effect.catchCause(() => Effect.succeed<JsonValue | null>(null)));
    const limits = payload.windowLimits;
    const windows = [
      commandCodeWindow(limits.fiveHour, "rolling", "5h"),
      commandCodeWindow(limits.weekly, "weekly", "weekly"),
      commandCodeMonthlyWindow(payload.credits, summarySpentCredits(summary)),
    ].filter((window): window is UsageWindow => window !== null);
    if (windows.length === 0) {
      return yield* decodeFailure();
    }
    return {
      capturedAt: new Date(yield* Clock.currentTimeMillis),
      id: PROVIDER_ID,
      label: config?.label ?? "Command Code",
      windows,
    };
  });

/** Fetches and normalizes Command Code usage using the provider runtime. */
export const fetchCommandCodeUsage = (
  config: CommandCodeProviderConfig | undefined,
  openCodeAuth: OpenCodeAuth | null,
  timeoutMs: number
): Promise<ProviderUsage<"commandcode">> =>
  Effect.runPromise(
    fetchCommandCodeUsageEffect(config, openCodeAuth, timeoutMs).pipe(
      Effect.provide(ProviderRuntimeLive)
    )
  );

/** Command Code provider adapter and OpenCode provider-ID mapping. */
export const commandCodeProvider = {
  defaultLabel: "Command Code",
  displayOrder: 6,
  fetch: fetchCommandCodeUsageEffect,
  footerWindowKind: "rolling",
  id: PROVIDER_ID,
  openCodeProviderIDs: [PROVIDER_ID],
} as const satisfies ProviderDefinition<"commandcode">;
