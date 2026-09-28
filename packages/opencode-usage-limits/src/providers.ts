import { Effect } from "effect";

import type { ProviderError } from "@/errors.ts";
import {
  isProviderID,
  PROVIDER_ORDER,
  PROVIDER_REGISTRY,
} from "@/providers/index.ts";
import type { ProviderRuntime } from "@/providers/runtime/index.ts";
import { ProviderRuntimeLive } from "@/providers/runtime/index.ts";
import type {
  OpenCodeAuth,
  ProviderConfigMap,
  ProviderID,
  ProviderUsage,
  ResolvedUsageLimitsConfig,
} from "@/types.ts";

const fetchProviderEffectInternal = (
  id: string,
  config: ProviderConfigMap[ProviderID] | undefined,
  openCodeAuth: OpenCodeAuth,
  timeoutMs: number
): Effect.Effect<ProviderUsage, ProviderError, ProviderRuntime> =>
  Effect.suspend<ProviderUsage, ProviderError, ProviderRuntime>(() => {
    if (!isProviderID(id)) {
      throw new Error(`unknown provider: ${id}`);
    }

    return PROVIDER_REGISTRY[id].fetch(config, openCodeAuth, timeoutMs);
  });

/**
 * Fetches one provider's usage as an Effect requiring provider runtime services.
 *
 * @param id - Provider adapter identifier.
 * @param config - Optional provider-specific configuration.
 * @param openCodeAuth - Credentials loaded from OpenCode's shared auth file.
 * @param timeoutMs - Maximum duration of the provider request.
 * @returns Provider usage, or a typed provider failure.
 */
export function fetchProviderEffect<ID extends ProviderID>(
  id: ID,
  config: ProviderConfigMap[ID] | undefined,
  openCodeAuth: OpenCodeAuth,
  timeoutMs: number
): Effect.Effect<ProviderUsage<ID>, ProviderError, ProviderRuntime>;
export function fetchProviderEffect(
  id: string,
  config: undefined,
  openCodeAuth: OpenCodeAuth,
  timeoutMs: number
): Effect.Effect<ProviderUsage, ProviderError, ProviderRuntime>;
export function fetchProviderEffect(
  id: string,
  config: ProviderConfigMap[ProviderID] | undefined,
  openCodeAuth: OpenCodeAuth,
  timeoutMs: number
): Effect.Effect<ProviderUsage, ProviderError, ProviderRuntime> {
  return fetchProviderEffectInternal(id, config, openCodeAuth, timeoutMs);
}

/**
 * Fetches one provider's usage using the production runtime and returns a Promise.
 *
 * @param id - Provider adapter identifier.
 * @param config - Optional provider-specific configuration.
 * @param openCodeAuth - Credentials loaded from OpenCode's shared auth file.
 * @param timeoutMs - Maximum duration of the provider request.
 * @returns A Promise for normalized provider usage.
 * @throws {ProviderError} When fetching or decoding usage fails.
 */
export function fetchProvider<ID extends ProviderID>(
  id: ID,
  config: ProviderConfigMap[ID] | undefined,
  openCodeAuth: OpenCodeAuth,
  timeoutMs: number
): Promise<ProviderUsage<ID>>;
export function fetchProvider(
  id: string,
  config: undefined,
  openCodeAuth: OpenCodeAuth,
  timeoutMs: number
): Promise<ProviderUsage>;
export function fetchProvider(
  id: string,
  config: ProviderConfigMap[ProviderID] | undefined,
  openCodeAuth: OpenCodeAuth,
  timeoutMs: number
): Promise<ProviderUsage> {
  return Effect.runPromise(
    fetchProviderEffectInternal(id, config, openCodeAuth, timeoutMs).pipe(
      Effect.provide(ProviderRuntimeLive)
    )
  );
}

/**
 * Lists configured and explicitly enabled providers in display order.
 *
 * @param config - Fully resolved plugin configuration.
 * @returns Provider IDs paired with their provider-specific configuration.
 */
export const getProviderConfigs = (
  config: ResolvedUsageLimitsConfig
): [ProviderID, ProviderConfigMap[ProviderID]][] =>
  PROVIDER_ORDER.flatMap((id) => {
    const provider = config.providers[id];
    if (provider?.enabled !== true) {
      return [];
    }
    return [[id, provider]];
  });
