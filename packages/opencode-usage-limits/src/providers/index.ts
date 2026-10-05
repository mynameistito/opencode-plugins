import { alibabaTokenPlanProvider } from "@/providers/alibaba-token-plan.ts";
import { codexProvider } from "@/providers/codex.ts";
import { commandCodeProvider } from "@/providers/commandcode.ts";
import { deepSeekProvider } from "@/providers/deepseek.ts";
import type { ProviderDefinition } from "@/providers/definition.ts";
import { minimaxProvider } from "@/providers/minimax.ts";
import { novitaAiProvider } from "@/providers/novita-ai.ts";
import { openCodeGoProvider } from "@/providers/opencode-go.ts";
import { openRouterProvider } from "@/providers/openrouter.ts";
import { qwenProvider } from "@/providers/qwen.ts";
import { syntheticProvider } from "@/providers/synthetic.ts";
import { zaiProvider } from "@/providers/zai-coding-plan.ts";
import type { ProviderID } from "@/types.ts";

/** Single ordered manifest of every supported provider definition. */
type ProviderRegistry = {
  [ID in ProviderID]: ProviderDefinition<ID>;
};

const PROVIDER_MANIFEST: ProviderRegistry = {
  "alibaba-token-plan": alibabaTokenPlanProvider,
  codex: codexProvider,
  commandcode: commandCodeProvider,
  deepseek: deepSeekProvider,
  minimax: minimaxProvider,
  "novita-ai": novitaAiProvider,
  "opencode-go": openCodeGoProvider,
  openrouter: openRouterProvider,
  qwen: qwenProvider,
  synthetic: syntheticProvider,
  zai: zaiProvider,
};

/** Supported providers in sidebar display order. */
export const PROVIDER_ORDER: readonly ProviderID[] = Object.values(
  PROVIDER_MANIFEST
)
  .toSorted((left, right) => left.displayOrder - right.displayOrder)
  .map((provider) => provider.id);

/** Registry mapping each supported ID to its provider definition. */
export const PROVIDER_REGISTRY = PROVIDER_MANIFEST;

/**
 * Checks whether a runtime string names a registered provider.
 *
 * @param value - Candidate provider identifier.
 * @returns `true` and narrows `value` when a provider is registered.
 */
export const isProviderID = (value: string): value is ProviderID =>
  PROVIDER_ORDER.some((id) => id === value);

/** Provider definitions projected in sidebar display order. */
export const PROVIDERS = Object.values(PROVIDER_MANIFEST).toSorted(
  (left, right) => left.displayOrder - right.displayOrder
);

/**
 * Gets the provider's default display label.
 *
 * @param id - Registered plugin provider identifier.
 * @returns Human-readable provider label.
 */
export const defaultLabelFor = (id: ProviderID): string =>
  PROVIDER_REGISTRY[id].defaultLabel;

/**
 * Maps an OpenCode provider identifier to its usage-limits adapter.
 *
 * @param openCodeID - Provider ID read from an OpenCode session.
 * @returns Matching plugin provider ID, or `null` when unsupported.
 */
export const pluginProviderForOpenCode = (
  openCodeID: string
): ProviderID | null => {
  for (const provider of PROVIDERS) {
    if (provider.openCodeProviderIDs.some((id) => id === openCodeID)) {
      return provider.id;
    }
  }
  return null;
};
