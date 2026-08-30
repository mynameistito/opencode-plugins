import { Effect } from "effect";

import type { ProviderError } from "@/errors.ts";
import { PROVIDER_ORDER, PROVIDER_REGISTRY } from "@/providers/index.ts";
import type { ProviderRuntime } from "@/providers/runtime/index.ts";
import { ProviderRuntimeLive } from "@/providers/runtime/index.ts";
import type {
  OpenCodeAuth,
  ProviderConfigMap,
  ProviderID,
  ProviderUsage,
  ResolvedUsageLimitsConfig,
} from "@/types.ts";

export const fetchProviderEffect = <ID extends ProviderID>(
  id: ID,
  config: ProviderConfigMap[ID] | undefined,
  openCodeAuth: OpenCodeAuth,
  timeoutMs: number
): Effect.Effect<ProviderUsage<ID>, ProviderError, ProviderRuntime> => {
  const provider = PROVIDER_REGISTRY[id];
  if (!provider) {
    throw new Error(`unknown provider: ${id}`);
  }

  return provider.fetch(config, openCodeAuth, timeoutMs);
};

/** Stable Promise export for direct consumers of the provider dispatcher. */
export const fetchProvider = <ID extends ProviderID>(
  id: ID,
  config: ProviderConfigMap[ID] | undefined,
  openCodeAuth: OpenCodeAuth,
  timeoutMs: number
): Promise<ProviderUsage<ID>> =>
  Effect.runPromise(
    fetchProviderEffect(id, config, openCodeAuth, timeoutMs).pipe(
      Effect.provide(ProviderRuntimeLive)
    )
  );

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
