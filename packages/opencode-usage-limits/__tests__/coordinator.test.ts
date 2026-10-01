import { setTimeout as delay } from "node:timers/promises";

import { Deferred, Effect, Fiber, Result } from "effect";
import { describe, expect, test } from "vitest";

import { usageCoordinator } from "@/coordinator.ts";
import type { CoordinatorSnapshot } from "@/coordinator.ts";
import {
  ConfigDecodeError,
  ConfigReadError,
  MissingProviderCredentialsError,
} from "@/errors.ts";
import type { ProviderError } from "@/errors.ts";
import type {
  ProviderID,
  ProviderConfigMap,
  ProviderUsage,
  ResolvedUsageLimitsConfig,
  OpenCodeAuth,
} from "@/types.ts";

const config: ResolvedUsageLimitsConfig = {
  enabled: true,
  providers: {
    codex: { enabled: true },
    zai: { enabled: true },
  },
  refreshIntervalSeconds: 15,
  requestTimeoutMs: 1000,
  showErrors: true,
};

const usage = <ID extends ProviderID>(id: ID): ProviderUsage<ID> => ({
  capturedAt: new Date("2026-08-14T12:00:00.000Z"),
  id,
  label: id,
  windows: [],
});

const successfulConfig = (
  value: ResolvedUsageLimitsConfig
): Result.Result<ResolvedUsageLimitsConfig, unknown> => Result.succeed(value);

const dependencies = (
  fetchProvider: <ID extends ProviderID>(
    id: ID
  ) => Effect.Effect<ProviderUsage<ID>, ProviderError>,
  initialConfig: ResolvedUsageLimitsConfig = config
) => {
  const auths: unknown[] = [];
  const snapshots: string[][] = [];
  const sleeps: Deferred.Deferred<boolean>[] = [];
  const fetches: ProviderID[] = [];
  return {
    auths,
    dependencies: {
      fetchProvider: <ID extends ProviderID>(
        id: ID,
        _config: ProviderConfigMap[ID] | undefined,
        auth: OpenCodeAuth
      ) =>
        Effect.tap(fetchProvider(id), () =>
          Effect.sync(() => {
            auths.push(auth);
            fetches.push(id);
          })
        ),
      loadConfig: Effect.succeed(successfulConfig(initialConfig)),
      loadOpenCodeAuth: Effect.succeed({ auth: {} }),
      now: Effect.succeed(new Date("2026-08-14T12:01:00.000Z")),
      publish: (snapshot: CoordinatorSnapshot) =>
        Effect.sync(() => {
          snapshots.push(snapshot.states.map((state) => state.status));
        }),
      sleep: () =>
        Effect.gen(function* sleep() {
          const deferred = yield* Deferred.make<boolean>();
          sleeps.push(deferred);
          yield* Deferred.await(deferred).pipe(Effect.asVoid);
        }),
    },
    fetches,
    sleeps,
    snapshots,
  };
};

const yieldToEventLoop = () => delay(0);

describe("usage coordinator", () => {
  test("propagates interruption while loading config", async () => {
    const harness = dependencies((id) => Effect.succeed(usage(id)));
    harness.dependencies.loadConfig = Effect.interrupt;
    const fiber = Effect.runFork(
      Effect.scoped(usageCoordinator(harness.dependencies))
    );

    await Effect.runPromise(Fiber.await(fiber));

    expect(harness.snapshots).toStrictEqual([]);
  });

  test("propagates interruption while loading auth", async () => {
    const harness = dependencies((id) => Effect.succeed(usage(id)));
    harness.dependencies.loadOpenCodeAuth = Effect.interrupt;
    const fiber = Effect.runFork(
      Effect.scoped(usageCoordinator(harness.dependencies))
    );

    await Effect.runPromise(Fiber.await(fiber));

    expect(harness.snapshots).toStrictEqual([["loading", "loading"]]);
  });

  test.each([
    [
      "decode",
      new ConfigDecodeError({ cause: "schema", operation: "parse-config" }),
      "config-decode",
    ],
    [
      "read",
      new ConfigReadError({
        cause: "filesystem",
        operation: "read-config",
        path: "usage-limits.jsonc",
      }),
      "config-read",
    ],
  ] as const)(
    "publishes a %s config diagnostic",
    async (_label, error, kind) => {
      const harness = dependencies((id) => Effect.succeed(usage(id)));
      harness.dependencies.loadConfig = Effect.succeed(Result.fail(error));
      const snapshots: CoordinatorSnapshot[] = [];
      harness.dependencies.publish = (snapshot) =>
        Effect.sync(() => {
          snapshots.push(snapshot);
        });
      const fiber = Effect.runFork(
        Effect.scoped(usageCoordinator(harness.dependencies))
      );

      await yieldToEventLoop();

      expect(snapshots[0]?.diagnostics[0]?.kind).toBe(kind);
      await Effect.runPromise(Fiber.interrupt(fiber));
    }
  );

  test("labels missing provider credentials in the published state", async () => {
    const harness = dependencies(() =>
      Effect.fail(
        new MissingProviderCredentialsError({
          operation: "fetch-usage",
          providerID: "codex",
        })
      )
    );
    const snapshots: CoordinatorSnapshot[] = [];
    harness.dependencies.publish = (snapshot) =>
      Effect.sync(() => {
        snapshots.push(snapshot);
      });
    const fiber = Effect.runFork(
      Effect.scoped(usageCoordinator(harness.dependencies))
    );

    await yieldToEventLoop();

    expect(snapshots.at(-1)?.states).toMatchObject([
      { errorKind: "missing_credentials", status: "error" },
      { errorKind: "missing_credentials", status: "error" },
    ]);
    await Effect.runPromise(Fiber.interrupt(fiber));
  });

  test("publishes loading before concurrent providers reach terminal state", async () => {
    const gates = new Map<ProviderID, Deferred.Deferred<boolean>>();
    const harness = dependencies((id) =>
      Effect.gen(function* providerWork() {
        const gate = yield* Deferred.make<boolean>();
        gates.set(id, gate);
        yield* Deferred.await(gate).pipe(Effect.asVoid);
        return usage(id);
      })
    );
    const fiber = Effect.runFork(
      Effect.scoped(usageCoordinator(harness.dependencies))
    );

    await yieldToEventLoop();
    expect(harness.snapshots[0]).toStrictEqual(["loading", "loading"]);
    expect(gates.size).toBe(2);

    const codexGate = gates.get("codex");
    if (!codexGate) {
      throw new Error("codex gate was not created");
    }
    await Effect.runPromise(Deferred.succeed(codexGate, true));
    await yieldToEventLoop();
    expect(harness.snapshots).toHaveLength(1);
    const zaiGate = gates.get("zai");
    if (!zaiGate) {
      throw new Error("zai gate was not created");
    }
    await Effect.runPromise(Deferred.succeed(zaiGate, true));
    await yieldToEventLoop();
    expect(harness.snapshots[1]).toStrictEqual(["ready", "ready"]);
    await Effect.runPromise(Fiber.interrupt(fiber));
  });

  test("keeps completed data visible and updates staleness while refreshing", async () => {
    const secondFetches = new Map<ProviderID, Deferred.Deferred<boolean>>();
    const gates = new Map<ProviderID, Deferred.Deferred<boolean>>();
    const fetchCounts = new Map<ProviderID, number>();
    const refreshTimes = [
      new Date("2026-08-14T12:00:00.000Z"),
      new Date("2026-08-14T12:00:15.000Z"),
      new Date("2026-08-14T12:00:31.000Z"),
      new Date("2026-08-14T12:00:40.000Z"),
    ];
    let nowIndex = 0;
    const gateEntries = await Promise.all(
      (["codex", "zai"] as const).map(
        async (id) =>
          [id, await Effect.runPromise(Deferred.make<boolean>())] as const
      )
    );
    for (const [id, gate] of gateEntries) {
      gates.set(id, gate);
    }
    const harness = dependencies((id) => {
      const count = (fetchCounts.get(id) ?? 0) + 1;
      fetchCounts.set(id, count);
      if (count === 1) {
        return Effect.succeed(usage(id));
      }
      const gate = gates.get(id);
      if (!gate) {
        throw new Error(`missing refresh gate for ${id}`);
      }
      secondFetches.set(id, gate);
      return Deferred.await(gate).pipe(Effect.as(usage(id)));
    });
    const snapshots: CoordinatorSnapshot[] = [];
    harness.dependencies.now = Effect.sync(() => {
      const now = refreshTimes[nowIndex];
      nowIndex += 1;
      if (!now) {
        throw new Error("coordinator clock sequence exhausted");
      }
      return now;
    });
    harness.dependencies.publish = (snapshot) =>
      Effect.sync(() => {
        snapshots.push(snapshot);
      });
    const fiber = Effect.runFork(
      Effect.scoped(usageCoordinator(harness.dependencies))
    );

    await yieldToEventLoop();
    await yieldToEventLoop();
    expect(snapshots[1]?.states).toMatchObject([
      { stale: false, status: "ready" },
      { stale: false, status: "ready" },
    ]);
    const completedAt = snapshots[1]?.lastRefreshAt;
    expect(completedAt).toBe(refreshTimes[1]);

    const [firstSleep] = harness.sleeps;
    if (!firstSleep) {
      throw new Error("first refresh did not schedule a sleep");
    }
    await Effect.runPromise(Deferred.succeed(firstSleep, true));
    await yieldToEventLoop();

    expect({
      inFlightCount: secondFetches.size,
      inFlightData: snapshots[2]?.states.map(
        (state) => state.status === "ready" && state.data
      ),
      inFlightRefreshAt: snapshots[2]?.lastRefreshAt,
      inFlightStates: snapshots[2]?.states.map((state) => ({
        stale: state.status === "ready" && state.stale,
        status: state.status,
      })),
    }).toStrictEqual({
      inFlightCount: 2,
      inFlightData: snapshots[1]?.states.map(
        (state) => state.status === "ready" && state.data
      ),
      inFlightRefreshAt: completedAt,
      inFlightStates: [
        { stale: true, status: "ready" },
        { stale: true, status: "ready" },
      ],
    });

    await Promise.all(
      [...secondFetches.values()].map((gate) =>
        Effect.runPromise(Deferred.succeed(gate, true))
      )
    );
    await yieldToEventLoop();
    expect(snapshots[3]?.lastRefreshAt).toBe(refreshTimes[3]);
    await Effect.runPromise(Fiber.interrupt(fiber));
  });

  test("shows loading again for providers that have never succeeded", async () => {
    const gate = await Effect.runPromise(Deferred.make<boolean>());
    let fetches = 0;
    const noZaiConfig: ResolvedUsageLimitsConfig = {
      ...config,
      providers: { codex: { enabled: true }, zai: { enabled: false } },
      showErrors: false,
    };
    const harness = dependencies((id) => {
      fetches += 1;
      return fetches === 1
        ? Effect.fail(
            new MissingProviderCredentialsError({
              operation: "fetch-usage",
              providerID: "codex",
            })
          )
        : Deferred.await(gate).pipe(Effect.as(usage(id)));
    }, noZaiConfig);
    const snapshots: CoordinatorSnapshot[] = [];
    harness.dependencies.publish = (snapshot) =>
      Effect.sync(() => {
        snapshots.push(snapshot);
      });
    const fiber = Effect.runFork(
      Effect.scoped(usageCoordinator(harness.dependencies))
    );

    await yieldToEventLoop();
    await yieldToEventLoop();
    expect(snapshots[1]?.states).toMatchObject([{ status: "error" }]);
    expect(snapshots[1]?.showErrors).toBeFalsy();
    const [firstSleep] = harness.sleeps;
    if (!firstSleep) {
      throw new Error("first refresh did not schedule a sleep");
    }
    await Effect.runPromise(Deferred.succeed(firstSleep, true));
    await yieldToEventLoop();

    expect(snapshots[2]?.states).toMatchObject([{ status: "loading" }]);
    expect(snapshots[2]?.showErrors).toBeFalsy();
    await Effect.runPromise(Fiber.interrupt(fiber));
  });

  test("retains the previous success after an error on later refreshes", async () => {
    const retryGate = await Effect.runPromise(Deferred.make<boolean>());
    let fetches = 0;
    const codexConfig: ResolvedUsageLimitsConfig = {
      ...config,
      providers: { codex: { enabled: true }, zai: { enabled: false } },
      showErrors: false,
    };
    const harness = dependencies((id) => {
      fetches += 1;
      if (fetches === 1) {
        return Effect.succeed(usage(id));
      }
      if (fetches === 2) {
        return Effect.fail(
          new MissingProviderCredentialsError({
            operation: "fetch-usage",
            providerID: id,
          })
        );
      }
      return Deferred.await(retryGate).pipe(Effect.as(usage(id)));
    }, codexConfig);
    const snapshots: CoordinatorSnapshot[] = [];
    harness.dependencies.publish = (snapshot) =>
      Effect.sync(() => {
        snapshots.push(snapshot);
      });
    const fiber = Effect.runFork(
      Effect.scoped(usageCoordinator(harness.dependencies))
    );

    await yieldToEventLoop();
    await yieldToEventLoop();
    const [firstSleep] = harness.sleeps;
    if (!firstSleep) {
      throw new Error("first refresh did not schedule a sleep");
    }
    await Effect.runPromise(Deferred.succeed(firstSleep, true));
    await yieldToEventLoop();
    await yieldToEventLoop();
    const [secondSleep] = harness.sleeps.slice(1);
    if (!secondSleep) {
      throw new Error("second refresh did not schedule a sleep");
    }
    await Effect.runPromise(Deferred.succeed(secondSleep, true));
    await yieldToEventLoop();

    expect({
      showErrors: snapshots[4]?.showErrors,
      state: snapshots[4]?.states[0],
    }).toMatchObject({
      showErrors: false,
      state: { previous: { id: "codex" }, status: "error" },
    });
    await Effect.runPromise(Fiber.interrupt(fiber));
  });

  test("clears cached state when a provider is disabled", async () => {
    const disabledCodexConfig: ResolvedUsageLimitsConfig = {
      ...config,
      providers: {
        ...config.providers,
        codex: { enabled: false },
      },
    };
    const configs = [config, disabledCodexConfig, config];
    let configIndex = 0;
    let codexFetches = 0;
    const harness = dependencies((id) => {
      if (id === "codex") {
        codexFetches += 1;
        if (codexFetches > 1) {
          return Effect.fail(
            new MissingProviderCredentialsError({
              operation: "fetch-usage",
              providerID: id,
            })
          );
        }
      }
      return Effect.succeed(usage(id));
    });
    const snapshots: CoordinatorSnapshot[] = [];
    harness.dependencies.loadConfig = Effect.sync(() => {
      const currentConfig = configs[configIndex];
      configIndex += 1;
      if (!currentConfig) {
        throw new Error("coordinator config sequence exhausted");
      }
      return successfulConfig(currentConfig);
    });
    harness.dependencies.publish = (snapshot) =>
      Effect.sync(() => {
        snapshots.push(snapshot);
      });
    const fiber = Effect.runFork(
      Effect.scoped(usageCoordinator(harness.dependencies))
    );

    await yieldToEventLoop();
    await yieldToEventLoop();
    const [firstSleep] = harness.sleeps;
    if (!firstSleep) {
      throw new Error("first refresh did not schedule a sleep");
    }
    await Effect.runPromise(Deferred.succeed(firstSleep, true));
    await yieldToEventLoop();
    await yieldToEventLoop();

    expect(
      snapshots[2]?.states.map((state) => [state.id, state.status])
    ).toStrictEqual([["zai", "ready"]]);
    const [secondSleep] = harness.sleeps.slice(1);
    if (!secondSleep) {
      throw new Error("second refresh did not schedule a sleep");
    }
    await Effect.runPromise(Deferred.succeed(secondSleep, true));
    await yieldToEventLoop();
    await yieldToEventLoop();

    expect(
      snapshots[4]?.states.map((state) => [state.id, state.status])
    ).toStrictEqual([
      ["codex", "loading"],
      ["zai", "ready"],
    ]);
    expect(snapshots[5]?.states).toMatchObject([
      { id: "codex", status: "error" },
      { id: "zai", status: "ready" },
    ]);
    expect(snapshots[5]?.states[0]).not.toHaveProperty("previous");
    await Effect.runPromise(Fiber.interrupt(fiber));
  });

  test("interrupts active provider work without publishing after disposal", async () => {
    const gate = await Effect.runPromise(Deferred.make<boolean>());
    const harness = dependencies((id) =>
      Deferred.await(gate).pipe(Effect.as(usage(id)))
    );
    const fiber = Effect.runFork(
      Effect.scoped(usageCoordinator(harness.dependencies))
    );

    await yieldToEventLoop();
    expect(harness.snapshots).toStrictEqual([["loading", "loading"]]);
    await Effect.runPromise(Fiber.interrupt(fiber));
    await Effect.runPromise(Deferred.succeed(gate, true));
    await yieldToEventLoop();
    expect(harness.snapshots).toHaveLength(1);
  });

  test("does not fetch disabled providers while fetching enabled providers", async () => {
    const harness = dependencies((id) => Effect.succeed(usage(id)), {
      ...config,
      providers: {
        codex: { enabled: false },
        zai: { enabled: true },
      },
    });
    const fiber = Effect.runFork(
      Effect.scoped(usageCoordinator(harness.dependencies))
    );

    await yieldToEventLoop();
    expect(harness.fetches).toStrictEqual(["zai"]);
    expect(harness.snapshots[0]).toStrictEqual(["loading"]);
    await Effect.runPromise(Fiber.interrupt(fiber));
  });

  test("keeps refreshing after an unexpected provider defect", async () => {
    let attempts = 0;
    const harness = dependencies(
      (id) => {
        attempts += 1;
        return attempts === 1
          ? (() => {
              throw new Error("unexpected provider failure");
            })()
          : Effect.succeed(usage(id));
      },
      {
        ...config,
        providers: { codex: { enabled: true }, zai: { enabled: false } },
      }
    );
    const fiber = Effect.runFork(
      Effect.scoped(usageCoordinator(harness.dependencies))
    );

    await yieldToEventLoop();
    expect(harness.snapshots[1]).toStrictEqual(["error"]);
    const [firstSleep] = harness.sleeps;
    if (!firstSleep) {
      throw new Error("first refresh did not schedule a sleep");
    }
    await Effect.runPromise(Deferred.succeed(firstSleep, true));
    await yieldToEventLoop();
    expect(harness.snapshots.at(-1)).toStrictEqual(["ready"]);
    await Effect.runPromise(Fiber.interrupt(fiber));
  });

  test("keeps refreshing after a direct publish throw", async () => {
    const harness = dependencies((id) => Effect.succeed(usage(id)), {
      ...config,
      providers: { codex: { enabled: true }, zai: { enabled: false } },
    });
    let publishes = 0;
    harness.dependencies.publish = (snapshot) => {
      publishes += 1;
      if (publishes === 1) {
        throw new Error("unexpected publish failure");
      }
      harness.snapshots.push(snapshot.states.map((state) => state.status));
      return Effect.void;
    };
    const fiber = Effect.runFork(
      Effect.scoped(usageCoordinator(harness.dependencies))
    );

    await yieldToEventLoop();
    expect(harness.snapshots).toStrictEqual([["ready"]]);
    const [firstSleep] = harness.sleeps;
    if (!firstSleep) {
      throw new Error("first refresh did not schedule a sleep");
    }
    await Effect.runPromise(Deferred.succeed(firstSleep, true));
    await yieldToEventLoop();
    expect(harness.snapshots.at(-1)).toStrictEqual(["ready"]);
    await Effect.runPromise(Fiber.interrupt(fiber));
  });

  test("keeps refreshing when a runtime loader defects", async () => {
    let loads = 0;
    const harness = dependencies((id) => Effect.succeed(usage(id)), {
      ...config,
      providers: { codex: { enabled: true }, zai: { enabled: false } },
    });
    harness.dependencies.loadConfig = Effect.sync(() => {
      loads += 1;
      if (loads === 1) {
        throw new Error("config loader failure");
      }
      return Result.succeed({
        ...config,
        providers: { codex: { enabled: true }, zai: { enabled: false } },
      });
    });
    const fiber = Effect.runFork(
      Effect.scoped(usageCoordinator(harness.dependencies))
    );

    await yieldToEventLoop();
    expect(harness.snapshots.at(-1)).toStrictEqual([]);
    const [firstSleep] = harness.sleeps;
    if (!firstSleep) {
      throw new Error("first refresh did not schedule a sleep");
    }
    await Effect.runPromise(Deferred.succeed(firstSleep, true));
    await yieldToEventLoop();
    expect(harness.snapshots.at(-1)).toStrictEqual(["ready"]);
    await Effect.runPromise(Fiber.interrupt(fiber));
  });

  test("reports an auth loader defect and fetches with empty auth", async () => {
    const harness = dependencies((id) => Effect.succeed(usage(id)), {
      ...config,
      providers: { codex: { enabled: true }, zai: { enabled: false } },
    });
    const snapshots: CoordinatorSnapshot[] = [];
    harness.dependencies.loadOpenCodeAuth = Effect.sync(() => {
      throw new Error("auth loader failure");
    });
    harness.dependencies.publish = (snapshot) =>
      Effect.sync(() => {
        snapshots.push(snapshot);
      });
    const fiber = Effect.runFork(
      Effect.scoped(usageCoordinator(harness.dependencies))
    );

    await yieldToEventLoop();
    expect(snapshots.at(-1)?.diagnostics).toStrictEqual([
      { kind: "auth-read", message: "OpenCode auth could not be read" },
    ]);
    expect(snapshots.at(-1)?.states).toMatchObject([{ status: "ready" }]);
    expect(harness.auths).toStrictEqual([{}]);
    await Effect.runPromise(Fiber.interrupt(fiber));
  });
});
