import { describe, expect, test } from "bun:test";

import { Deferred, Effect, Fiber, Result } from "effect";

import { usageCoordinator } from "@/coordinator.ts";
import type { CoordinatorSnapshot } from "@/coordinator.ts";
import type { ProviderError } from "@/errors.ts";
import type {
  OpenCodeAuth,
  ProviderID,
  ProviderUsage,
  ResolvedUsageLimitsConfig,
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

const usage = (id: ProviderID): ProviderUsage => ({
  capturedAt: new Date("2026-08-14T12:00:00.000Z"),
  id,
  label: id,
  windows: [],
});

const dependencies = (
  fetchProvider: (
    id: ProviderID
  ) => Effect.Effect<ProviderUsage, ProviderError>,
  initialConfig: ResolvedUsageLimitsConfig = config
) => {
  const snapshots: string[][] = [];
  const sleeps: Deferred.Deferred<boolean>[] = [];
  const fetches: ProviderID[] = [];
  return {
    dependencies: {
      fetchProvider: <ID extends ProviderID>(id: ID) =>
        // SAFETY: The test dispatcher returns the usage type selected by ID.
        Effect.tap(fetchProvider(id), () =>
          Effect.sync(() => {
            fetches.push(id);
          })
        ) as Effect.Effect<ProviderUsage<ID>, ProviderError>,
      loadConfig: Effect.succeed(Result.succeed(initialConfig)),
      // SAFETY: An empty auth object is a valid parsed OpenCode auth value.
      loadOpenCodeAuth: Effect.succeed({} as OpenCodeAuth),
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

describe("usage coordinator", () => {
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

    await Bun.sleep(0);
    expect(harness.snapshots[0]).toEqual(["loading", "loading"]);
    expect(gates.size).toBe(2);

    const codexGate = gates.get("codex");
    if (!codexGate) {
      throw new Error("codex gate was not created");
    }
    await Effect.runPromise(Deferred.succeed(codexGate, true));
    await Bun.sleep(0);
    expect(harness.snapshots).toHaveLength(1);
    const zaiGate = gates.get("zai");
    if (!zaiGate) {
      throw new Error("zai gate was not created");
    }
    await Effect.runPromise(Deferred.succeed(zaiGate, true));
    await Bun.sleep(0);
    expect(harness.snapshots[1]).toEqual(["ready", "ready"]);
    await Effect.runPromise(Fiber.interrupt(fiber));
  });

  test("interrupts active provider work without publishing after disposal", async () => {
    const gate = await Effect.runPromise(Deferred.make<boolean>());
    const harness = dependencies(() =>
      Deferred.await(gate).pipe(Effect.as(usage("codex")))
    );
    const fiber = Effect.runFork(
      Effect.scoped(usageCoordinator(harness.dependencies))
    );

    await Bun.sleep(0);
    expect(harness.snapshots).toEqual([["loading", "loading"]]);
    await Effect.runPromise(Fiber.interrupt(fiber));
    await Effect.runPromise(Deferred.succeed(gate, true));
    await Bun.sleep(0);
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

    await Bun.sleep(0);
    expect(harness.fetches).toEqual(["zai"]);
    expect(harness.snapshots[0]).toEqual(["loading"]);
    await Effect.runPromise(Fiber.interrupt(fiber));
  });

  test("keeps refreshing after an unexpected provider defect", async () => {
    let attempts = 0;
    const harness = dependencies(
      () => {
        attempts += 1;
        return attempts === 1
          ? (() => {
              throw new Error("unexpected provider failure");
            })()
          : Effect.succeed(usage("codex"));
      },
      {
        ...config,
        providers: { codex: { enabled: true }, zai: { enabled: false } },
      }
    );
    const fiber = Effect.runFork(
      Effect.scoped(usageCoordinator(harness.dependencies))
    );

    await Bun.sleep(0);
    expect(harness.snapshots[1]).toEqual(["error"]);
    const [firstSleep] = harness.sleeps;
    if (!firstSleep) {
      throw new Error("first refresh did not schedule a sleep");
    }
    await Effect.runPromise(Deferred.succeed(firstSleep, true));
    await Bun.sleep(0);
    expect(harness.snapshots.at(-1)).toEqual(["ready"]);
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

    await Bun.sleep(0);
    expect(harness.snapshots).toEqual([["ready"]]);
    const [firstSleep] = harness.sleeps;
    if (!firstSleep) {
      throw new Error("first refresh did not schedule a sleep");
    }
    await Effect.runPromise(Deferred.succeed(firstSleep, true));
    await Bun.sleep(0);
    expect(harness.snapshots.at(-1)).toEqual(["ready"]);
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

    await Bun.sleep(0);
    expect(harness.snapshots.at(-1)).toEqual([]);
    const [firstSleep] = harness.sleeps;
    if (!firstSleep) {
      throw new Error("first refresh did not schedule a sleep");
    }
    await Effect.runPromise(Deferred.succeed(firstSleep, true));
    await Bun.sleep(0);
    expect(harness.snapshots.at(-1)).toEqual(["ready"]);
    await Effect.runPromise(Fiber.interrupt(fiber));
  });
});
