import { Cause, Effect, Result } from "effect";

import { DEFAULT_CONFIG } from "@/config.ts";
import type { ConfigDiagnostic } from "@/config.ts";
import {
  ConfigDecodeError,
  ConfigReadError,
  MissingProviderCredentialsError,
  ProviderTransportError,
} from "@/errors.ts";
import type { ProviderError } from "@/errors.ts";
import { getProviderConfigs } from "@/providers.ts";
import { defaultLabelFor } from "@/providers/index.ts";
import type {
  OpenCodeAuth,
  ProviderConfigMap,
  ProviderDisplayConfig,
  ProviderID,
  ProviderState,
  ProviderUsage,
  ResolvedUsageLimitsConfig,
} from "@/types.ts";

export interface CoordinatorSnapshot {
  /** Configuration or auth diagnostics to display. */
  readonly diagnostics: readonly ConfigDiagnostic[];
  /** Latest state for each configured provider. */
  readonly states: readonly ProviderState[];
  /** Resolved per-provider sidebar and footer display preferences. */
  readonly providerDisplays: Readonly<
    Partial<Record<ProviderID, ProviderDisplayConfig>>
  >;
  /** Whether provider errors should be shown in the sidebar. */
  readonly showErrors: boolean;
  /** Time of the most recent completed provider refresh, if any. */
  readonly lastRefreshAt: Date | null;
}

/** Dependencies and observable effects for the periodic usage refresh loop. */
export interface UsageCoordinatorDependencies {
  readonly loadConfig: Effect.Effect<
    Result.Result<ResolvedUsageLimitsConfig, unknown>
  >;
  readonly loadOpenCodeAuth: Effect.Effect<{
    readonly auth: OpenCodeAuth;
    readonly diagnostic?: ConfigDiagnostic;
  }>;
  readonly fetchProvider: <ID extends ProviderID>(
    id: ID,
    config: ProviderConfigMap[ID] | undefined,
    auth: OpenCodeAuth,
    timeoutMs: number
  ) => Effect.Effect<ProviderUsage<ID>, ProviderError>;
  readonly now: Effect.Effect<Date>;
  readonly sleep: (milliseconds: number) => Effect.Effect<void>;
  readonly publish: (snapshot: CoordinatorSnapshot) => Effect.Effect<void>;
}

const intervalMilliseconds = (seconds: number): number =>
  Math.max(15, seconds) * 1000;

const errorMessage = (error: Error): string =>
  error instanceof Error ? error.message : "usage unavailable";

const errorKind = (error: Error): "missing_credentials" | undefined =>
  error instanceof MissingProviderCredentialsError ? error.kind : undefined;

const loadingState = (
  id: ProviderID,
  config: ProviderConfigMap[ProviderID]
): ProviderState => ({
  id,
  label: config.label ?? defaultLabelFor(id),
  status: "loading",
});

const providerDisplaysFor = (
  providers: readonly (readonly [ProviderID, ProviderConfigMap[ProviderID]])[]
): Partial<Record<ProviderID, ProviderDisplayConfig>> =>
  Object.fromEntries(
    providers.map(([id, provider]) => [
      id,
      {
        footerWindow: provider.footerWindow ?? "auto",
        showFooterBar: provider.showFooterBar ?? true,
        showSidebarBar: provider.showSidebarBar ?? true,
        sidebarWindow: provider.sidebarWindow ?? "all",
      },
    ])
  );

const clearDisabledProviderStates = (
  providerIDs: ReadonlySet<ProviderID>,
  lastStates: Map<ProviderID, ProviderState>,
  lastSuccess: Map<ProviderID, ProviderUsage>
): void => {
  for (const id of lastStates.keys()) {
    if (!providerIDs.has(id)) {
      lastStates.delete(id);
      lastSuccess.delete(id);
    }
  }
};

const cacheProviderStates = (
  states: readonly ProviderState[],
  lastStates: Map<ProviderID, ProviderState>
): void => {
  for (const state of states) {
    if (
      state.status === "ready" ||
      (state.status === "error" && state.previous)
    ) {
      lastStates.set(state.id, state);
    }
  }
};

const safePublish = (
  dependencies: UsageCoordinatorDependencies,
  snapshot: CoordinatorSnapshot
): Effect.Effect<void> =>
  Effect.suspend(() => dependencies.publish(snapshot)).pipe(
    Effect.catchDefect(() => Effect.void)
  );

const safeFetchProvider = <ID extends ProviderID>(
  dependencies: UsageCoordinatorDependencies,
  id: ID,
  provider: ProviderConfigMap[ID] | undefined,
  auth: OpenCodeAuth,
  timeoutMs: number
): Effect.Effect<ProviderUsage<ID>, ProviderError> =>
  Effect.suspend(() =>
    dependencies.fetchProvider(id, provider, auth, timeoutMs)
  ).pipe(
    Effect.catchDefect(() =>
      Effect.fail(
        new ProviderTransportError({
          cause: "unknown",
          operation: "fetch-usage",
          providerID: id,
        })
      )
    )
  );

const configDiagnosticFor = (
  result: Result.Result<ResolvedUsageLimitsConfig, unknown>
): ConfigDiagnostic | undefined => {
  if (Result.isSuccess(result)) {
    return;
  }
  if (result.failure instanceof ConfigDecodeError) {
    return { kind: "config-decode", message: result.failure.message };
  }
  return {
    kind: "config-read",
    message: "Usage-limits config could not be read",
  };
};

/**
 * Runs the recurring configuration load, provider fetch, and snapshot publish loop.
 *
 * Successful provider results are retained for stale-data fallback after later
 * fetch failures. The returned Effect runs until interrupted.
 *
 * @param dependencies - Loaders, provider fetcher, clock, scheduler, and publisher.
 * @returns Effect that completes only when interrupted or failed by interruption.
 */
export const usageCoordinator = (
  dependencies: UsageCoordinatorDependencies
): Effect.Effect<void> =>
  Effect.gen(function* coordinatorLoop() {
    const lastSuccess = new Map<ProviderID, ProviderUsage>();
    const lastStates = new Map<ProviderID, ProviderState>();
    let lastRefreshAt: Date | null = null;
    while (true) {
      const configResult = yield* dependencies.loadConfig.pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.failCause(cause)
            : Effect.succeed(
                Result.fail(
                  new ConfigReadError({
                    cause: "filesystem",
                    operation: "read-config",
                    path: "usage-limits.jsonc",
                  })
                )
              )
        )
      );
      const configDiagnostic = configDiagnosticFor(configResult);
      const config = Result.isFailure(configResult)
        ? DEFAULT_CONFIG
        : configResult.success;

      const intervalMs = intervalMilliseconds(config.refreshIntervalSeconds);
      const staleAfterMs = intervalMs * 2;
      const refreshStartedAt = yield* dependencies.now;
      const providers = config.enabled ? getProviderConfigs(config) : [];
      const providerIDs = new Set(providers.map(([id]) => id));
      clearDisabledProviderStates(providerIDs, lastStates, lastSuccess);
      yield* safePublish(dependencies, {
        diagnostics: configDiagnostic ? [configDiagnostic] : [],
        lastRefreshAt,
        providerDisplays: providerDisplaysFor(providers),
        showErrors: config.showErrors,
        states: providers.map(([id, provider]) => {
          const previous = lastStates.get(id);
          if (!previous) {
            return loadingState(id, provider);
          }
          if (previous.status === "ready") {
            return {
              ...previous,
              stale:
                refreshStartedAt.getTime() -
                  previous.data.capturedAt.getTime() >
                staleAfterMs,
            };
          }
          return previous;
        }),
      });

      if (providers.length > 0) {
        const authLoad = yield* dependencies.loadOpenCodeAuth.pipe(
          Effect.catchCause((cause) =>
            Cause.hasInterruptsOnly(cause)
              ? Effect.failCause(cause)
              : Effect.succeed({
                  auth: {},
                  diagnostic: {
                    kind: "auth-read" as const,
                    message: "OpenCode auth could not be read",
                  },
                })
          )
        );
        const { auth } = authLoad;
        const terminalStates = yield* Effect.all(
          providers.map(([id, provider]) =>
            Effect.match(
              safeFetchProvider(
                dependencies,
                id,
                provider,
                auth,
                config.requestTimeoutMs
              ),
              {
                onFailure: (error) => ({ error }),
                onSuccess: (data) => ({ data }),
              }
            ).pipe(
              Effect.map((result): ProviderState => {
                const label = provider.label ?? defaultLabelFor(id);
                if ("data" in result) {
                  lastSuccess.set(id, result.data);
                  return {
                    data: result.data,
                    id,
                    label,
                    stale: false,
                    status: "ready",
                  };
                }
                const previous = lastSuccess.get(id);
                const state: ProviderState = {
                  errorKind: errorKind(result.error),
                  id,
                  label,
                  message: errorMessage(result.error),
                  status: "error",
                };
                if (previous) {
                  return { ...state, previous };
                }
                return state;
              })
            )
          ),
          { concurrency: "unbounded" }
        );
        const now = yield* dependencies.now;
        lastRefreshAt = now;
        const states = terminalStates.map((state) =>
          state.status === "ready"
            ? {
                ...state,
                stale:
                  now.getTime() - state.data.capturedAt.getTime() >
                  staleAfterMs,
              }
            : state
        );
        cacheProviderStates(states, lastStates);
        yield* safePublish(dependencies, {
          diagnostics: authLoad.diagnostic ? [authLoad.diagnostic] : [],
          lastRefreshAt: now,
          providerDisplays: providerDisplaysFor(providers),
          showErrors: config.showErrors,
          states,
        });
      } else {
        lastRefreshAt = null;
        yield* safePublish(dependencies, {
          diagnostics: configDiagnostic ? [configDiagnostic] : [],
          lastRefreshAt: null,
          providerDisplays: {},
          showErrors: config.showErrors,
          states: [],
        });
      }

      yield* dependencies.sleep(intervalMs);
    }
  });
