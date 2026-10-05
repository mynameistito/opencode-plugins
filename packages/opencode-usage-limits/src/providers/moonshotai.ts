import { Clock, Effect, Redacted, Result } from "effect";

import {
  MissingProviderCredentialsError,
  ProviderResponseDecodeError,
} from "@/errors.ts";
import { readProviderAuthFileCredential } from "@/providers/auth-file.ts";
import type { ProviderDefinition } from "@/providers/definition.ts";
import { isJsonNumber } from "@/providers/json.ts";
import { ProviderEnvironment } from "@/providers/runtime/environment.ts";
import { ProviderHttpClient } from "@/providers/runtime/http.ts";
import { ProviderRuntimeLive } from "@/providers/runtime/index.ts";
import type {
  MoonshotAiProviderConfig,
  OpenCodeAuth,
  ProviderUsage,
  UsageWindow,
} from "@/types.ts";
import type { BalanceAmount } from "@/usage.ts";
import { balanceQuota, parseUsageBalanceAmount } from "@/usage.ts";
import { isRecord } from "@/utils.ts";
import type { JsonObject, JsonValue } from "@/utils.ts";
import { resolveHttpsBaseUrl } from "@/utils/url.ts";

interface MoonshotRegion<ID extends "moonshotai" | "moonshotai-cn"> {
  readonly baseUrl: string;
  readonly currency: "CNY" | "USD";
  readonly id: ID;
  readonly label: string;
}

const regions = {
  moonshotai: {
    baseUrl: "https://api.moonshot.ai",
    currency: "USD",
    id: "moonshotai",
    label: "Moonshot AI",
  },
  "moonshotai-cn": {
    baseUrl: "https://api.moonshot.cn",
    currency: "CNY",
    id: "moonshotai-cn",
    label: "Moonshot AI CN",
  },
} as const satisfies {
  moonshotai: MoonshotRegion<"moonshotai">;
  "moonshotai-cn": MoonshotRegion<"moonshotai-cn">;
};

const BALANCE_PATH = "/v1/users/me/balance";

const keyFromMoonshotAuth = (
  providerID: "moonshotai" | "moonshotai-cn",
  value: JsonObject,
  credential: (
    value: JsonValue | undefined
  ) => Redacted.Redacted<string> | undefined
): Redacted.Redacted<string> | undefined => {
  const direct = credential(value.key) ?? credential(value.apiKey);
  if (direct) {
    return direct;
  }
  const entry = value[providerID];
  if (!isRecord(entry)) {
    return undefined;
  }
  return credential(entry.key) ?? credential(entry.apiKey);
};

const keyFromOpenCodeAuth = (
  providerID: "moonshotai" | "moonshotai-cn",
  value: OpenCodeAuth,
  credential: (
    value: JsonValue | Redacted.Redacted<string> | undefined
  ) => Redacted.Redacted<string> | undefined
): Redacted.Redacted<string> | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const entry = value[providerID];
  if (!isRecord(entry)) {
    return undefined;
  }
  return credential(entry.key) ?? credential(entry.apiKey);
};

const balanceUrl = (baseUrl: string): string => {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/u, "")}${BALANCE_PATH}`;
  url.hash = "";
  return url.toString();
};

const parseMoonshotBalance = (value: JsonValue): BalanceAmount | null => {
  if (!isRecord(value) || value.code !== 0 || value.status !== true) {
    return null;
  }
  if (!isRecord(value.data)) {
    return null;
  }
  const amount = value.data.available_balance;
  if (!isJsonNumber(amount) || !Number.isFinite(amount)) {
    return null;
  }
  const parsed = parseUsageBalanceAmount(amount);
  return Result.isSuccess(parsed) ? parsed.success : null;
};

const balanceWindow = (
  amount: BalanceAmount,
  region: MoonshotRegion<"moonshotai" | "moonshotai-cn">
): UsageWindow => ({
  kind: "credits",
  label: `${region.currency} balance`,
  quota: balanceQuota(amount, region.currency),
  resetsAt: null,
});

const fetchMoonshotBalanceUsageEffect = <
  ID extends "moonshotai" | "moonshotai-cn",
>(
  region: MoonshotRegion<ID>,
  config: MoonshotAiProviderConfig | undefined,
  openCodeAuth: OpenCodeAuth,
  timeoutMs: number
): ReturnType<ProviderDefinition<ID>["fetch"]> =>
  Effect.gen(function* runFetchMoonshotBalanceUsage() {
    const environment = yield* ProviderEnvironment;
    const http = yield* ProviderHttpClient;
    const baseUrl = resolveHttpsBaseUrl(config?.baseUrl, region.baseUrl);
    const isOfficialOrigin = new URL(baseUrl).origin === region.baseUrl;
    const authFileKey = yield* readProviderAuthFileCredential(
      config?.authPath,
      region.id,
      (value, credential) => keyFromMoonshotAuth(region.id, value, credential)
    );
    const configuredKey = environment.resolveCredential(config?.apiKey);
    const authKey = keyFromOpenCodeAuth(
      region.id,
      openCodeAuth,
      environment.credential
    );
    const apiKey =
      authFileKey ??
      (isOfficialOrigin ? (authKey ?? configuredKey) : configuredKey);
    if (!apiKey) {
      return yield* new MissingProviderCredentialsError({
        operation: "fetch-usage",
        providerID: region.id,
      });
    }

    const payload = yield* http.requestJson({
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${Redacted.value(apiKey)}`,
      },
      method: "GET",
      providerID: region.id,
      timeoutMs,
      url: balanceUrl(baseUrl),
    });
    const amount = parseMoonshotBalance(payload);
    if (amount === null) {
      return yield* new ProviderResponseDecodeError({
        cause: "schema",
        operation: "decode-response",
        providerID: region.id,
      });
    }

    return {
      capturedAt: new Date(yield* Clock.currentTimeMillis),
      id: region.id,
      label: config?.label ?? region.label,
      windows: [balanceWindow(amount, region)],
    };
  });

const createMoonshotProvider = <ID extends "moonshotai" | "moonshotai-cn">(
  region: MoonshotRegion<ID>
): ProviderDefinition<ID> => ({
  defaultLabel: region.label,
  displayOrder: region.id === "moonshotai" ? 11 : 12,
  fetch: (config, openCodeAuth, timeoutMs) =>
    fetchMoonshotBalanceUsageEffect(region, config, openCodeAuth, timeoutMs),
  footerWindowKind: "credits",
  id: region.id,
  openCodeProviderIDs: [region.id],
});

export const moonshotAiProvider = createMoonshotProvider(regions.moonshotai);
export const moonshotAiCnProvider = createMoonshotProvider(
  regions["moonshotai-cn"]
);

/** Fetches the global Moonshot/Kimi API balance. */
export const fetchMoonshotAiBalanceUsage = (
  config: MoonshotAiProviderConfig | undefined,
  openCodeAuth: OpenCodeAuth,
  timeoutMs: number
): Promise<ProviderUsage<"moonshotai">> =>
  Effect.runPromise(
    fetchMoonshotBalanceUsageEffect(
      regions.moonshotai,
      config,
      openCodeAuth,
      timeoutMs
    ).pipe(Effect.provide(ProviderRuntimeLive))
  );

/** Fetches the China Moonshot/Kimi API balance. */
export const fetchMoonshotAiCnBalanceUsage = (
  config: MoonshotAiProviderConfig | undefined,
  openCodeAuth: OpenCodeAuth,
  timeoutMs: number
): Promise<ProviderUsage<"moonshotai-cn">> =>
  Effect.runPromise(
    fetchMoonshotBalanceUsageEffect(
      regions["moonshotai-cn"],
      config,
      openCodeAuth,
      timeoutMs
    ).pipe(Effect.provide(ProviderRuntimeLive))
  );
