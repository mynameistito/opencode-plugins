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
