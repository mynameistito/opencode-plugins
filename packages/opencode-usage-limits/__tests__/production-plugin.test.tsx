import { setTimeout as delay } from "node:timers/promises";

import { RGBA } from "@opentui/core";
import { Result } from "effect";
import { describe, expect, test } from "vitest";

import type { UsageTheme } from "@/components.tsx";
import {
  createUsageLimitsPlugin,
  makeProductionDependencies,
} from "@/plugin.tsx";
import type { UsageLimitsContext } from "@/plugin.tsx";
import type { ResolvedUsageLimitsConfig } from "@/types.ts";

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

describe("production plugin dependencies", () => {
  test("loads config and auth and runs the real provider runtime adapter", async () => {
    const config: ResolvedUsageLimitsConfig = {
      enabled: true,
      providers: { synthetic: { enabled: true } },
      refreshIntervalSeconds: 15,
      requestTimeoutMs: 1000,
      showErrors: true,
    };
    let configLoads = 0;
    let authLoads = 0;
    const dependencies = makeProductionDependencies({
      loadConfig: () => {
        configLoads += 1;
        return Promise.resolve(Result.succeed(config));
      },
      loadOpenCodeAuth: () => {
        authLoads += 1;
        return Promise.resolve({ auth: {} });
      },
    });
    const claims: string[] = [];
    const context: UsageLimitsContext = {
      data: {
        session: {
          get: () => {},
          message: { list: () => [] },
        },
      },
      theme,
      ui: {
        slot: (claim) => {
          claims.push(claim.append);
          return () => {};
        },
      },
    };

    const dispose = createUsageLimitsPlugin(dependencies)(context);
    await delay(0);
    dispose();

    expect(configLoads).toBe(1);
    expect(authLoads).toBe(1);
    expect(claims.toSorted()).toStrictEqual([
      "prompt.footer.status",
      "sidebar.content",
    ]);
  });
});
