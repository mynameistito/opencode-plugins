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
  DeepSeekProviderConfig,
  OpenCodeAuth,
  ProviderUsage,
  UsageWindow,
} from "@/types.ts";
import type { QuotaCount } from "@/usage.ts";
import { balanceQuota, parseUsageBalance } from "@/usage.ts";
import { isRecord } from "@/utils.ts";
import type { JsonObject, JsonValue } from "@/utils.ts";
import { resolveHttpsBaseUrl } from "@/utils/url.ts";

/** Default DeepSeek API origin used for balance requests. */
const DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const DEEPSEEK_BALANCE_PATH = "/user/balance";
const PROVIDER_ID = "deepseek" as const;
const DECIMAL_STRING = /^\d+(?:\.\d+)?$/u;

interface DeepSeekBalanceInfo {
  readonly currency: string;
  readonly totalBalance: QuotaCount;
}

interface DeepSeekPayload {
  readonly isAvailable: boolean;
  readonly balances: readonly DeepSeekBalanceInfo[];
}

const keyFromDeepSeekAuth = (
  value: JsonObject,
  credential: (
    value: JsonValue | undefined
  ) => Redacted.Redacted<string> | undefined
): Redacted.Redacted<string> | undefined => {
  const direct = credential(value.key) ?? credential(value.apiKey);
  if (direct) {
    return direct;
  }
  if (!isRecord(value.deepseek)) {
    return undefined;
  }
  return credential(value.deepseek.key) ?? credential(value.deepseek.apiKey);
};

const keyFromOpenCodeAuth = (
  value: JsonObject,
  credential: (
    value: JsonValue | undefined
  ) => Redacted.Redacted<string> | undefined
): Redacted.Redacted<string> | undefined => {
  if (!isRecord(value.deepseek)) {
    return undefined;
  }
  return credential(value.deepseek.key) ?? credential(value.deepseek.apiKey);
};

const parseDecimalBalance = (
  value: JsonValue | undefined
): QuotaCount | null => {
  if (!isJsonString(value) || !DECIMAL_STRING.test(value)) {
    return null;
  }
  const parsed = Number(value);
  if (
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    (parsed === 0 && /[1-9]/u.test(value))
  ) {
    return null;
  }
  const result = parseUsageBalance(parsed);
  return Result.isSuccess(result) ? result.success : null;
};

const parseDeepSeekBalanceInfo = (
  value: JsonValue | undefined
): DeepSeekBalanceInfo | null => {
  if (!isRecord(value) || !isJsonString(value.currency)) {
    return null;
  }
  const currency = value.currency.trim();
  const totalBalance = parseDecimalBalance(value.total_balance);
  const grantedBalance = parseDecimalBalance(value.granted_balance);
  const toppedUpBalance = parseDecimalBalance(value.topped_up_balance);
  if (
    currency === "" ||
    totalBalance === null ||
    grantedBalance === null ||
    toppedUpBalance === null
  ) {
    return null;
  }
  return { currency, totalBalance };
};

const parseDeepSeekPayload = (value: JsonObject): DeepSeekPayload | null => {
  if (
    !isJsonBoolean(value.is_available) ||
    !Array.isArray(value.balance_infos)
  ) {
    return null;
  }
  const balances = value.balance_infos.flatMap((entry) => {
    const parsed = parseDeepSeekBalanceInfo(entry);
    return parsed ? [parsed] : [];
  });
  return { balances, isAvailable: value.is_available };
};

const balanceWindow = (balance: DeepSeekBalanceInfo): UsageWindow => ({
  kind: "credits",
  label: balance.currency,
  quota: balanceQuota(balance.totalBalance, balance.currency),
  resetsAt: null,
});

/** Fetches and normalizes DeepSeek currency balances. */
const fetchDeepSeekBalanceUsageEffect = (
  config: DeepSeekProviderConfig | undefined,
  openCodeAuth: OpenCodeAuth,
  timeoutMs: number
): ReturnType<ProviderDefinition<"deepseek">["fetch"]> =>
  Effect.gen(function* runFetchDeepSeekBalanceUsage() {
    const environment = yield* ProviderEnvironment;
    const http = yield* ProviderHttpClient;
    const baseUrl = resolveHttpsBaseUrl(
      config?.baseUrl,
      DEFAULT_DEEPSEEK_BASE_URL
    );
    const isOfficialOrigin =
      new URL(baseUrl).origin === DEFAULT_DEEPSEEK_BASE_URL;
    const authFileKey = yield* readProviderAuthFileCredential(
      config?.authPath,
      PROVIDER_ID,
      keyFromDeepSeekAuth
    );
    const configuredKey = environment.resolveCredential(config?.apiKey);
    const authKey = isRecord(openCodeAuth)
      ? keyFromOpenCodeAuth(openCodeAuth, environment.credential)
      : undefined;
    const apiKey =
      authFileKey ??
      (isOfficialOrigin ? (authKey ?? configuredKey) : configuredKey);
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
      url: `${baseUrl}${DEEPSEEK_BALANCE_PATH}`,
    });
    const parsedPayload = isRecord(payload)
      ? parseDeepSeekPayload(payload)
      : null;
    if (!parsedPayload || parsedPayload.balances.length === 0) {
      return yield* new ProviderResponseDecodeError({
        cause: "schema",
        operation: "decode-response",
        providerID: PROVIDER_ID,
      });
    }

    return {
      capturedAt: new Date(yield* Clock.currentTimeMillis),
      id: PROVIDER_ID,
      label: config?.label ?? "DeepSeek",
      metadata: { isAvailable: parsedPayload.isAvailable },
      windows: parsedPayload.balances.map(balanceWindow),
    };
  });

/** Fetches DeepSeek's available balance windows from its official API. */
export const fetchDeepSeekBalanceUsage = (
  config: DeepSeekProviderConfig | undefined,
  openCodeAuth: OpenCodeAuth,
  timeoutMs: number
): Promise<ProviderUsage<"deepseek">> =>
  Effect.runPromise(
    fetchDeepSeekBalanceUsageEffect(config, openCodeAuth, timeoutMs).pipe(
      Effect.provide(ProviderRuntimeLive)
    )
  );

/** DeepSeek balance provider adapter and OpenCode provider-ID mapping. */
export const deepSeekProvider = {
  defaultLabel: "DeepSeek",
  displayOrder: 8,
  fetch: fetchDeepSeekBalanceUsageEffect,
  footerWindowKind: "credits",
  id: PROVIDER_ID,
  openCodeProviderIDs: [PROVIDER_ID],
} as const satisfies ProviderDefinition<"deepseek">;
