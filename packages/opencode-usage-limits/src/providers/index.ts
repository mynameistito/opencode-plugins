import { codexProvider } from "@/providers/codex.ts";
import type { ProviderDefinition } from "@/providers/definition.ts";
import { minimaxProvider } from "@/providers/minimax.ts";
import { openCodeGoProvider } from "@/providers/opencode-go.ts";
import { qwenProvider } from "@/providers/qwen.ts";
import { syntheticProvider } from "@/providers/synthetic.ts";
import { zaiProvider } from "@/providers/zai-coding-plan.ts";
import type { ProviderID } from "@/types.ts";

/** Single ordered manifest of every supported provider definition. */
type ProviderRegistry = {
  [ID in ProviderID]: ProviderDefinition<ID>;
};

const PROVIDER_MANIFEST: ProviderRegistry = {
  codex: codexProvider,
  minimax: minimaxProvider,
  "opencode-go": openCodeGoProvider,
  qwen: qwenProvider,
  synthetic: syntheticProvider,
  zai: zaiProvider,
};

/** Sidebar display order derived from the provider manifest. */
export const PROVIDER_ORDER: readonly ProviderID[] = Object.values(
  PROVIDER_MANIFEST
)
  .toSorted((left, right) => left.displayOrder - right.displayOrder)
  .map((provider) => provider.id);

/** Provider lookup derived from the same ordered manifest. */
export const PROVIDER_REGISTRY = PROVIDER_MANIFEST;

/** Provider definitions projected in explicit sidebar display order. */
export const PROVIDERS = Object.values(PROVIDER_MANIFEST).toSorted(
  (left, right) => left.displayOrder - right.displayOrder
);

/** Returns the default display label for a provider ID. */
export const defaultLabelFor = (id: ProviderID): string =>
  PROVIDER_REGISTRY[id].defaultLabel;

/** Maps an OpenCode session provider ID to a plugin provider ID. */
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
