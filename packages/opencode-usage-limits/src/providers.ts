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

/** Stable Promise export for direct consumers of the provider dispatcher. */
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
