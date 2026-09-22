/* @jsxImportSource @opentui/solid */
import type { JSX } from "@opentui/solid";
import { Effect, Fiber } from "effect";
import { createSignal } from "solid-js";

import { BottomUsage, UsageLimitsPanel } from "@/components.tsx";
import type { UsageTheme } from "@/components.tsx";
import { loadConfig, loadOpenCodeAuth } from "@/config.ts";
import type { CoordinatorSnapshot } from "@/coordinator.ts";
import { usageCoordinator } from "@/coordinator.ts";
import type { ProviderError } from "@/errors.ts";
import { fetchProviderEffect } from "@/providers.ts";
import { ProviderRuntimeLive } from "@/providers/runtime/index.ts";
import {
  currentProviderID,
  usageForProvider,
  usageProviderFor,
} from "@/session.ts";
import type {
  ProviderID,
  OpenCodeAuth,
  ProviderConfigMap,
  ProviderUsage,
} from "@/types.ts";
import type { JsonValue } from "@/utils.ts";

const SIDEBAR_SLOT = "sidebar.content" as const;
const FOOTER_SLOT = "prompt.footer.status" as const;

/** Runtime dependencies used by the usage-limits TUI lifecycle. */
export interface UsageLimitsTuiDependencies {
  /** Fetches one configured provider's usage. */
  fetchProvider: <ID extends ProviderID>(
    id: ID,
    config: ProviderConfigMap[ID] | undefined,
    openCodeAuth: OpenCodeAuth,
    timeoutMs: number
  ) => Effect.Effect<ProviderUsage<ID>, ProviderError>;
  /** Loads the fully resolved plugin configuration. */
  loadConfig: () => Promise<Awaited<ReturnType<typeof loadConfig>>>;
  /** Loads shared OpenCode provider authentication. */
  loadOpenCodeAuth: () => Promise<Awaited<ReturnType<typeof loadOpenCodeAuth>>>;
  /** Returns the current wall-clock time. */
  now: () => Date;
  /** Suspends the coordinator until its next refresh. */
  sleep?: (milliseconds: number) => Effect.Effect<void>;
}

export interface UsageLimitsSlotContext {
  readonly sessionID?: string;
  readonly mode?: "normal" | "shell";
}

interface UsageLimitsSlotClaim {
  readonly append: typeof SIDEBAR_SLOT | typeof FOOTER_SLOT;
  readonly render: (slot: UsageLimitsSlotContext) => JSX.Element | null;
}

export interface UsageLimitsContext {
  readonly data: {
    readonly session: {
      readonly get: (sessionID: string) =>
        | {
            readonly model?: { readonly providerID?: string };
          }
        | undefined;
      readonly message: {
        readonly list: (sessionID: string) => readonly JsonValue[];
      };
    };
  };
  readonly theme: UsageTheme;
  readonly ui: {
    readonly slot: (claim: UsageLimitsSlotClaim) => () => void;
  };
}

const productionDependencies: UsageLimitsTuiDependencies = {
  fetchProvider: (id, config, auth, timeoutMs) =>
    fetchProviderEffect(id, config, auth, timeoutMs).pipe(
      Effect.provide(ProviderRuntimeLive)
    ),
  loadConfig,
  loadOpenCodeAuth,
  now: () => new Date(),
};

/**
 * Creates the OpenCode TUI plugin with explicit runtime dependencies.
 *
 * The plugin periodically loads configuration, fetches enabled provider usage,
 * stores the latest successful result for stale/error fallback, and registers UI
 * slots for both the sidebar panel and prompt-footer indicator.
 *
 * @param dependencies - Runtime loaders, provider fetcher, scheduler, and clock.
 * @returns The configured OpenCode v2 plugin setup function.
 */
export const createUsageLimitsPlugin =
  (dependencies: UsageLimitsTuiDependencies) =>
  (context: UsageLimitsContext): (() => void) => {
    const [snapshot, setSnapshot] = createSignal<CoordinatorSnapshot>({
      diagnostics: [],
      lastRefreshAt: null,
      providerDisplays: {},
      showErrors: true,
      states: [],
    });
    const disposeSidebar = context.ui.slot({
      append: SIDEBAR_SLOT,
      render: () => (
        <UsageLimitsPanel
          diagnostics={snapshot().diagnostics}
          providerDisplays={snapshot().providerDisplays}
          showErrors={snapshot().showErrors}
          states={snapshot().states}
          theme={context.theme}
          lastRefreshAt={snapshot().lastRefreshAt}
        />
      ),
    });
    const disposeFooter = context.ui.slot({
      append: FOOTER_SLOT,
      render: (slot) => {
        if (!slot.sessionID || slot.mode === "shell") {
          return null;
        }
        const session = context.data.session.get(slot.sessionID);
        const providerID =
          session?.model?.providerID ??
          currentProviderID(context.data.session.message.list(slot.sessionID));
        const selectedProviderID = usageProviderFor(
          snapshot().states,
          providerID,
          snapshot().providerDisplays
        );
        return (
          <BottomUsage
            theme={context.theme}
            showBar={
              selectedProviderID
                ? snapshot().providerDisplays[selectedProviderID]
                    ?.showFooterBar !== false
                : true
            }
            window={usageForProvider(
              snapshot().states,
              providerID,
              snapshot().providerDisplays
            )}
          />
        );
      },
    });

    const coordinator = usageCoordinator({
      fetchProvider: dependencies.fetchProvider,
      loadConfig: Effect.promise(() => dependencies.loadConfig()),
      loadOpenCodeAuth: Effect.promise(() => dependencies.loadOpenCodeAuth()),
      now: Effect.sync(dependencies.now),
      publish: (nextSnapshot) => Effect.sync(() => setSnapshot(nextSnapshot)),
      sleep: (milliseconds) =>
        dependencies.sleep?.(milliseconds) ?? Effect.sleep(milliseconds),
    });
    const fiber = Effect.runFork(Effect.scoped(coordinator));
    return () => {
      disposeSidebar();
      disposeFooter();
      Effect.runFork(Fiber.interrupt(fiber));
    };
  };

/** OpenCode v2 plugin setup using production runtime dependencies. */
export const setupUsageLimitsPlugin = createUsageLimitsPlugin(
  productionDependencies
);
