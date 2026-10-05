import { Clock, Effect, Redacted, Result } from "effect";

import {
  MissingProviderCredentialsError,
  ProviderResponseDecodeError,
} from "@/errors.ts";
import { readProviderAuthFileCredential } from "@/providers/auth-file.ts";
import type { ProviderDefinition } from "@/providers/definition.ts";
import { isJsonString } from "@/providers/json.ts";
import { ProviderEnvironment } from "@/providers/runtime/environment.ts";
import { ProviderHttpClient } from "@/providers/runtime/http.ts";
import { ProviderRuntimeLive } from "@/providers/runtime/index.ts";
import type {
  NovitaAiProviderConfig,
  OpenCodeAuth,
  ProviderUsage,
  UsageWindow,
} from "@/types.ts";
import type { QuotaCount } from "@/usage.ts";
import { balanceQuota, parseUsageBalance } from "@/usage.ts";
import { isRecord } from "@/utils.ts";
import type { JsonObject, JsonValue } from "@/utils.ts";
import { resolveHttpsBaseUrl } from "@/utils/url.ts";

/** Default Novita AI API origin used for balance requests. */
const DEFAULT_NOVITA_AI_BASE_URL = "https://api.novita.ai";
const NOVITA_AI_BALANCE_PATH = "/openapi/v1/billing/balance/detail";
const PROVIDER_ID = "novita-ai" as const;
const MINOR_UNIT_STRING = /^\d+$/u;
const MAX_SAFE_MINOR_UNITS = BigInt(Number.MAX_SAFE_INTEGER);
type CredentialInput = JsonValue | Redacted.Redacted<string> | undefined;

const keyFromNovitaAiAuth = (
  value: JsonObject,
  credential: (
    value: JsonValue | undefined
  ) => Redacted.Redacted<string> | undefined
): Redacted.Redacted<string> | undefined => {
  const direct = credential(value.key) ?? credential(value.apiKey);
  if (direct) {
    return direct;
  }
  if (!isRecord(value[PROVIDER_ID])) {
    return undefined;
  }
  return (
    credential(value[PROVIDER_ID].key) ?? credential(value[PROVIDER_ID].apiKey)
  );
};

const keyFromOpenCodeAuth = (
  value: OpenCodeAuth,
  credential: (value: CredentialInput) => Redacted.Redacted<string> | undefined
): Redacted.Redacted<string> | undefined => {
  const auth = isRecord(value) ? value : undefined;
  if (!auth || !isRecord(auth[PROVIDER_ID])) {
    return undefined;
  }
  return (
    credential(auth[PROVIDER_ID].key) ?? credential(auth[PROVIDER_ID].apiKey)
  );
};

/** Converts Novita's integer ten-thousandths-of-a-dollar amount to USD. */
const parseAvailableBalance = (
  value: JsonValue | undefined
): QuotaCount | null => {
  if (!isJsonString(value) || !MINOR_UNIT_STRING.test(value)) {
    return null;
  }
  const normalized = value.replace(/^0+/u, "") || "0";
  if (normalized.length > String(Number.MAX_SAFE_INTEGER).length) {
    return null;
  }
  const minorUnits = BigInt(normalized);
  if (minorUnits > MAX_SAFE_MINOR_UNITS) {
    return null;
  }
  const parsed = parseUsageBalance(Number(minorUnits) / 10_000);
  return Result.isSuccess(parsed) ? parsed.success : null;
};

const novitaAiBalanceUrl = (baseUrl: string): string => {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/u, "")}${NOVITA_AI_BALANCE_PATH}`;
  url.hash = "";
  return url.toString();
};

const novitaAiBalanceWindow = (amount: QuotaCount): UsageWindow => ({
  kind: "credits",
  label: "balance",
  quota: balanceQuota(amount, "USD"),
  resetsAt: null,
});

/** Fetches and normalizes Novita AI's available USD balance. */
const fetchNovitaAiBalanceUsageEffect = (
  config: NovitaAiProviderConfig | undefined,
  openCodeAuth: OpenCodeAuth,
  timeoutMs: number
): ReturnType<ProviderDefinition<"novita-ai">["fetch"]> =>
  Effect.gen(function* runFetchNovitaAiBalanceUsage() {
    const environment = yield* ProviderEnvironment;
    const http = yield* ProviderHttpClient;
    const baseUrl = resolveHttpsBaseUrl(
      config?.baseUrl,
      DEFAULT_NOVITA_AI_BASE_URL
    );
    const isOfficialOrigin =
      new URL(baseUrl).origin === DEFAULT_NOVITA_AI_BASE_URL;
    const authFileKey = yield* readProviderAuthFileCredential(
      config?.authPath,
      PROVIDER_ID,
      keyFromNovitaAiAuth
    );
    const configuredKey = environment.resolveCredential(config?.apiKey);
    const authKey = keyFromOpenCodeAuth(openCodeAuth, environment.credential);
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
      url: novitaAiBalanceUrl(baseUrl),
    });
    const amount = isRecord(payload)
      ? parseAvailableBalance(payload.availableBalance)
      : null;
    if (amount === null) {
      return yield* new ProviderResponseDecodeError({
        cause: "schema",
        operation: "decode-response",
        providerID: PROVIDER_ID,
      });
    }

    return {
      capturedAt: new Date(yield* Clock.currentTimeMillis),
      id: PROVIDER_ID,
      label: config?.label ?? "Novita AI",
      windows: [novitaAiBalanceWindow(amount)],
    };
  });

/** Fetches Novita AI's available balance from its official billing API. */
export const fetchNovitaAiBalanceUsage = (
  config: NovitaAiProviderConfig | undefined,
  openCodeAuth: OpenCodeAuth,
  timeoutMs: number
): Promise<ProviderUsage<"novita-ai">> =>
  Effect.runPromise(
    fetchNovitaAiBalanceUsageEffect(config, openCodeAuth, timeoutMs).pipe(
      Effect.provide(ProviderRuntimeLive)
    )
  );

/** Novita AI balance adapter and OpenCode provider-ID mapping. */
export const novitaAiProvider = {
  defaultLabel: "Novita AI",
  displayOrder: 9,
  fetch: fetchNovitaAiBalanceUsageEffect,
  footerWindowKind: "credits",
  id: PROVIDER_ID,
  openCodeProviderIDs: [PROVIDER_ID],
} as const satisfies ProviderDefinition<"novita-ai">;
