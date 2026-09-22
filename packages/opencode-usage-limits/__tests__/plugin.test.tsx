import { setTimeout as delay } from "node:timers/promises";

import { RGBA } from "@opentui/core";
import { testRender } from "@opentui/solid";
import type { JSX } from "@opentui/solid";
import { Deferred, Effect, Result } from "effect";
/* @jsxImportSource @opentui/solid */
import { describe, expect, test } from "vitest";

import type { UsageTheme } from "@/components.tsx";
import { ConfigDecodeError } from "@/errors.ts";
import type { ProviderError } from "@/errors.ts";
import { ProviderTransportError } from "@/errors/transport.ts";
import { createUsageLimitsPlugin } from "@/plugin.tsx";
import type {
  UsageLimitsContext,
  UsageLimitsSlotContext,
  UsageLimitsTuiDependencies,
} from "@/plugin.tsx";
import type {
  OpenCodeAuth,
  ProviderConfig,
  ProviderID,
  ProviderUsage,
  ResolvedUsageLimitsConfig,
} from "@/types.ts";
import { parseUsagePercentage, percentageQuota } from "@/usage.ts";

const NOW = new Date("2026-08-14T12:34:00.000Z");
const color = RGBA.fromValues(1, 2, 3, 255);
const theme: UsageTheme = {
  text: {
    default: color,
    feedback: {
      error: { default: color },
      success: { default: color },
      warning: { default: color },
    },
    subdued: color,
  },
};

type CharacterizedSlots = Record<
  "sidebar.content" | "prompt.footer.status",
  (context: UsageLimitsSlotContext) => JSX.Element | null
>;

interface HarnessState {
  config: ResolvedUsageLimitsConfig;
  configError: ConfigDecodeError | null;
  fetchError: ProviderError | null;
}

const DEFAULT_SLOT: UsageLimitsSlotContext = {
  mode: "normal",
  sessionID: "session-1",
};

interface ScheduledRefresh {
  callback: () => Promise<void>;
  cancelled: boolean;
  delayMs: number;
}

const config = (
  overrides: Partial<ResolvedUsageLimitsConfig> = {}
): ResolvedUsageLimitsConfig => ({
  enabled: true,
  providers: { codex: { enabled: true, label: "Codex Work" } },
  refreshIntervalSeconds: 20,
  requestTimeoutMs: 5000,
  showErrors: true,
  ...overrides,
});

const usage = <ID extends ProviderID>(id: ID): ProviderUsage<ID> => ({
  capturedAt: NOW,
  id,
  label: "Codex Work",
  windows: [
    {
      kind: "rolling",
      label: "5h",
      quota: percentageQuota(Result.getOrThrow(parseUsagePercentage(42))),
      resetsAt: new Date("2026-08-14T13:34:00.000Z"),
    },
  ],
});

const createHarness = (
  initialConfig = config(),
  sessionProviderID = "openai"
) => {
  const scheduled: ScheduledRefresh[] = [];
  const fetches: ProviderID[] = [];
  const auth: OpenCodeAuth = {};
  let currentSessionModelProviderID = sessionProviderID;
  const state: HarnessState = {
    config: initialConfig,
    configError: null,
    fetchError: null,
  };
  let dispose: (() => void) | undefined;
  let slotDisposals = 0;
  let registered: Partial<CharacterizedSlots> | undefined;

  const dependencies: UsageLimitsTuiDependencies = {
    fetchProvider: <ID extends ProviderID>(
      id: ID,
      _providerConfig: ProviderConfig | undefined,
      _openCodeAuth: OpenCodeAuth,
      _timeoutMs: number
    ) => {
      fetches.push(id);
      if (state.fetchError) {
        return Effect.fail(state.fetchError);
      }
      return Effect.succeed(usage(id));
    },
    loadConfig: () =>
      Promise.resolve(
        state.configError
          ? Result.fail(state.configError)
          : Result.succeed(state.config)
      ),
    loadOpenCodeAuth: () => Promise.resolve({ auth }),
    now: () => NOW,
    sleep: (delayMs) =>
      Effect.gen(function* sleep() {
        const deferred = yield* Deferred.make<boolean>();
        const scheduledRefresh: ScheduledRefresh = {
          callback: async () => {
            await Effect.runPromise(Deferred.succeed(deferred, true));
          },
          cancelled: false,
          delayMs,
        };
        scheduled.push(scheduledRefresh);
        yield* Effect.ensuring(
          Deferred.await(deferred).pipe(Effect.asVoid),
          Effect.sync(() => {
            scheduledRefresh.cancelled = true;
          })
        );
      }),
  };

  const partialApi: UsageLimitsContext = {
    data: {
      session: {
        get: () => ({ model: { providerID: currentSessionModelProviderID } }),
        message: { list: () => [{ providerID: sessionProviderID }] },
      },
    },
    theme,
    ui: {
      slot: (claim) => {
        registered = { ...registered, [claim.append]: claim.render };
        return () => {
          slotDisposals += 1;
        };
      },
    },
  };

  return {
    context: partialApi,
    dependencies,
    fetches,
    getDispose: () => dispose,
    getRegistered: () => registered,
    getSlotDisposals: () => slotDisposals,
    scheduled,
    setDispose: (cleanup: () => void) => {
      dispose = cleanup;
    },
    setSessionModelProviderID: (providerID: string) => {
      currentSessionModelProviderID = providerID;
    },
    state,
  };
};

const renderSlot = async (
  registered: CharacterizedSlots,
  name: "prompt.footer.status" | "sidebar.content",
  slot: UsageLimitsSlotContext = DEFAULT_SLOT
): Promise<string> => {
  const setup = await testRender(() => registered[name](slot), {
    height: 12,
    width: 80,
  });
  try {
    await setup.flush();
    return setup.captureCharFrame();
  } finally {
    setup.renderer.destroy();
  }
};

const slotCases = [
  [
    { providers: { codex: { enabled: true, showSidebarBar: false } } },
    "sidebar.content",
    "42% used",
  ],
  [
    { providers: { codex: { enabled: true, showFooterBar: false } } },
    "prompt.footer.status",
    "42%",
  ],
] satisfies readonly (readonly [
  Partial<ResolvedUsageLimitsConfig>,
  keyof CharacterizedSlots,
  string,
])[];

const initialize = async (harness: ReturnType<typeof createHarness>) => {
  harness.setDispose(
    createUsageLimitsPlugin(harness.dependencies)(harness.context)
  );
  await delay(0);
  const registered = harness.getRegistered();
  if (!registered) {
    throw new Error("plugin did not register slots");
  }
  const sidebar = registered["sidebar.content"];
  const footer = registered["prompt.footer.status"];
  if (!sidebar || !footer) {
    throw new Error("plugin did not register both slots");
  }
  return { "prompt.footer.status": footer, "sidebar.content": sidebar };
};

describe("usage-limits TUI lifecycle", () => {
  test("registers both slots with initial successful state", async () => {
    const harness = createHarness();
    const registered = await initialize(harness);

    expect(harness.fetches).toStrictEqual(["codex"]);
    expect(harness.scheduled[0]?.delayMs).toBe(20_000);
    await expect(renderSlot(registered, "sidebar.content")).resolves.toContain(
      "Codex Work"
    );
    await expect(renderSlot(registered, "sidebar.content")).resolves.toContain(
      "Updated 12:34"
    );
    await expect(
      renderSlot(registered, "prompt.footer.status")
    ).resolves.toContain("42%");
  });

  test("retains the previous successful state when a provider fails", async () => {
    const harness = createHarness();
    const registered = await initialize(harness);
    harness.state.fetchError = new ProviderTransportError({
      cause: "network",
      operation: "fetch-usage",
      providerID: "codex",
    });

    await harness.scheduled[0]?.callback();
    await delay(0);

    const sidebar = await renderSlot(registered, "sidebar.content");
    expect(sidebar).toContain("Codex Work cached");
    expect(sidebar).toContain("provider request failed");
    await expect(
      renderSlot(registered, "prompt.footer.status")
    ).resolves.toContain("42%");
  });

  test("keeps both slots empty when the plugin is disabled", async () => {
    const harness = createHarness(config({ enabled: false }));
    const registered = await initialize(harness);

    expect(harness.fetches).toStrictEqual([]);
    await expect(
      renderSlot(registered, "sidebar.content")
    ).resolves.not.toContain("Usage Limits");
    await expect(
      renderSlot(registered, "prompt.footer.status")
    ).resolves.not.toContain("%");
  });

  test("hides only both graphical bars without stopping provider refreshes", async () => {
    const harness = createHarness(
      config({
        providers: {
          codex: {
            enabled: true,
            showFooterBar: false,
            showSidebarBar: false,
          },
        },
      })
    );
    const registered = await initialize(harness);

    expect(harness.fetches).toStrictEqual(["codex"]);
    const sidebar = await renderSlot(registered, "sidebar.content");
    const footer = await renderSlot(registered, "prompt.footer.status");
    expect(sidebar).toMatch(/Codex[\s\S]*42% used/u);
    expect(sidebar).not.toContain("[█████░░░░░░░]");
    expect(footer).toContain("42%");
    expect(footer).not.toContain("[████░░░░░░░░]");
  });

  test.each(slotCases)(
    "hides only the configured %s bar",
    async (overrides, slot, text) => {
      const harness = createHarness(config(overrides));
      const registered = await initialize(harness);

      const rendered = await renderSlot(registered, slot);
      expect(rendered).toContain(text);
      expect(rendered).not.toContain(
        slot === "sidebar.content" ? "[█████░░░░░░░]" : "[████░░░░░░░░]"
      );
    }
  );

  test("does not keep historical provider usage after switching models", async () => {
    const harness = createHarness();
    const registered = await initialize(harness);

    await expect(
      renderSlot(registered, "prompt.footer.status")
    ).resolves.toContain("42%");

    harness.setSessionModelProviderID("anthropic");

    await expect(
      renderSlot(registered, "prompt.footer.status")
    ).resolves.not.toContain("42%");
  });

  test("does not render footer usage for shell mode or missing sessions", async () => {
    const harness = createHarness();
    const registered = await initialize(harness);

    await expect(
      renderSlot(registered, "prompt.footer.status", {
        mode: "shell",
        sessionID: "session-1",
      })
    ).resolves.not.toContain("42%");
    await expect(
      renderSlot(registered, "prompt.footer.status", {
        mode: "normal",
      })
    ).resolves.not.toContain("42%");
  });

  test("uses safe defaults when typed config parsing fails", async () => {
    const harness = createHarness();
    harness.state.configError = new ConfigDecodeError({
      cause: "schema",
      operation: "parse-config",
    });
    const registered = await initialize(harness);

    expect(harness.fetches).toStrictEqual([]);
    expect(harness.scheduled[0]?.delayMs).toBe(60_000);
    await expect(renderSlot(registered, "sidebar.content")).resolves.toContain(
      "Usage Limits"
    );
  });

  test("uses a changed interval for the next scheduled refresh", async () => {
    const harness = createHarness();
    await initialize(harness);
    harness.state.config = config({ refreshIntervalSeconds: 45 });

    await harness.scheduled[0]?.callback();
    await delay(0);

    expect(harness.scheduled.map(({ delayMs }) => delayMs)).toStrictEqual([
      20_000, 45_000,
    ]);
  });

  test("disposal cancels the pending refresh", async () => {
    const harness = createHarness();
    await initialize(harness);
    const dispose = harness.getDispose();
    if (!dispose) {
      throw new Error("plugin did not register disposal");
    }

    dispose();
    await delay(0);

    expect(harness.scheduled[0]?.cancelled).toBeTruthy();
    expect(harness.getSlotDisposals()).toBe(2);
    expect(harness.fetches).toStrictEqual(["codex"]);
  });
});
