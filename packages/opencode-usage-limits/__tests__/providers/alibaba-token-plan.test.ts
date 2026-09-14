import { describe, expect, test } from "bun:test";

import { Effect, Exit, Layer, Result } from "effect";

import { parseUsageLimitsConfig } from "@/config-schema.ts";
import { ProviderCommandError, ProviderTimeoutError } from "@/errors.ts";
import { alibabaTokenPlanProvider } from "@/providers/alibaba-token-plan.ts";
import { pluginProviderForOpenCode } from "@/providers/index.ts";
import { ProviderCommandExecutor } from "@/providers/runtime/command.ts";
import type { ProviderCommandInput } from "@/providers/runtime/command.ts";
import { ProviderRuntimeLive } from "@/providers/runtime/index.ts";
import type { AlibabaTokenPlanProviderConfig } from "@/types.ts";

const run = (
  output: string | ProviderCommandError | ProviderTimeoutError,
  config?: AlibabaTokenPlanProviderConfig,
  version = "bl 1.15.0"
) => {
  const calls: ProviderCommandInput[] = [];
  const commands = Layer.succeed(ProviderCommandExecutor, {
    execute: (input) => {
      calls.push(input);
      if (calls.length === 1) {
        return Effect.succeed(version);
      }
      return output instanceof Error
        ? Effect.fail(output)
        : Effect.succeed(output);
    },
  });
  const effect = alibabaTokenPlanProvider
    .fetch(config, {}, 4321)
    .pipe(Effect.provide(commands), Effect.provide(ProviderRuntimeLive));
  return { calls, effect };
};

describe("Alibaba Token Plan", () => {
  test("normalizes fractions, millisecond resets and both quota windows", async () => {
    const reset = Date.parse("2026-09-10T12:00:00Z");
    const { effect, calls } = run(
      JSON.stringify({
        per1WeekPercentage: 1,
        per1WeekResetTime: reset + 604_800_000,
        per5HourPercentage: 0.25,
        per5HourResetTime: reset,
      })
    );
    const usage = await Effect.runPromise(effect);
    expect(usage.id).toBe("alibaba-token-plan");
    expect(usage.label).toBe("Alibaba Token Plan");
    expect(usage.windows.map((w) => w.quota)).toMatchObject([
      { _tag: "Percentage", remainingPercent: 75, usedPercent: 25 },
      { _tag: "Percentage", remainingPercent: 0, usedPercent: 100 },
    ]);
    expect(usage.windows[0]?.resetsAt?.getTime()).toBe(reset);
    expect(usage.windows[1]?.kind).toBe("weekly");
    expect(calls).toEqual([
      {
        args: ["--version"],
        command: "bl",
        providerID: "alibaba-token-plan",
        timeoutMs: 4321,
      },
      {
        args: [
          "usage",
          "token-plan",
          "--console-region",
          "ap-southeast-1",
          "--console-site",
          "international",
          "--output",
          "json",
        ],
        command: "bl",
        providerID: "alibaba-token-plan",
        timeoutMs: 4321,
      },
    ]);
  });

  test("supports China, labels, zero usage and a missing window", async () => {
    const { effect, calls } = run('{"per1WeekPercentage":0}', {
      label: "Solo",
      region: "china",
    });
    const usage = await Effect.runPromise(effect);
    expect(usage.label).toBe("Solo");
    expect(usage.windows).toHaveLength(1);
    expect(usage.windows[0]).toMatchObject({
      kind: "weekly",
      quota: { usedPercent: 0 },
      resetsAt: null,
    });
    expect(calls[1]?.args).toContain("cn-beijing");
    expect(calls[1]?.args).toContain("domestic");
  });

  for (const reset of [null, false, "2026-09-10", -1, 0, 1e30]) {
    test(`does not invent a reset from ${JSON.stringify(reset)}`, async () => {
      const { effect } = run(
        JSON.stringify({
          per1WeekPercentage: null,
          per5HourPercentage: 0.5,
          per5HourResetTime: reset,
        })
      );
      const usage = await Effect.runPromise(effect);
      expect(usage.windows[0]?.resetsAt).toBeNull();
    });
  }

  for (const payload of [
    "not JSON",
    "null",
    "[]",
    "{}",
    '{"success":false}',
    '{"per5HourPercentage":true}',
    '{"per5HourPercentage":"0.5"}',
    '{"per5HourPercentage":-0.1}',
    '{"per5HourPercentage":1.1}',
    '{"per5HourPercentage":1e400}',
  ]) {
    test(`rejects missing or invalid quota: ${payload}`, async () => {
      const result = await Effect.runPromiseExit(run(payload).effect);
      expect(Exit.isFailure(result)).toBe(true);
      expect(JSON.stringify(result)).toContain("ProviderResponseDecodeError");
    });
  }

  test("preserves bounded runtime command errors and timeouts", async () => {
    await Promise.all(
      [
        new ProviderCommandError({
          cause: "command",
          operation: "run-command",
          providerID: "alibaba-token-plan",
        }),
        new ProviderTimeoutError({
          cause: "timeout",
          operation: "run-command",
          providerID: "alibaba-token-plan",
          timeoutMs: 4321,
        }),
      ].map(async (error) => {
        const result = await Effect.runPromiseExit(run(error).effect);
        expect(Exit.isFailure(result)).toBe(true);
        expect(JSON.stringify(result)).toContain(error._tag);
      })
    );
  });

  test("rejects an unsupported Bailian CLI version with an upgrade diagnostic", async () => {
    try {
      await Effect.runPromise(
        run('{"per1WeekPercentage":0}', undefined, "bl version 1.14.3").effect
      );
      throw new Error("expected unsupported CLI version");
    } catch (error) {
      expect(error instanceof Error ? error.message : "").toContain(
        "Bailian CLI >= 1.15.0 is required"
      );
    }
  });

  test("checks the Bailian version instead of an unrelated runtime version", async () => {
    const result = await Effect.runPromiseExit(
      run(
        '{"per1WeekPercentage":0}',
        undefined,
        "node v20.11.0\nbl version 1.14.3"
      ).effect
    );
    expect(Exit.isFailure(result)).toBe(true);
    expect(JSON.stringify(result)).toContain('"cause":"unsupported"');
  });

  test("supports the scoped package version banner", async () => {
    const { effect, calls } = run(
      '{"per1WeekPercentage":0}',
      undefined,
      "@bailian/cli/1.15.0 darwin-arm64 node-v20.11.0"
    );
    const usage = await Effect.runPromise(effect);
    expect(usage.id).toBe("alibaba-token-plan");
    expect(calls).toHaveLength(2);
  });

  test("reports an unparseable Bailian version separately", async () => {
    const result = await Effect.runPromiseExit(
      run('{"per1WeekPercentage":0}', undefined, "Bailian CLI").effect
    );
    expect(Exit.isFailure(result)).toBe(true);
    expect(JSON.stringify(result)).toContain('"cause":"invalid-version"');
  });

  test("validates configuration and registers footer provider aliases", () => {
    expect(
      Result.isSuccess(
        parseUsageLimitsConfig({
          providers: {
            "alibaba-token-plan": { enabled: true, region: "international" },
          },
        })
      )
    ).toBe(true);
    expect(
      Result.isFailure(
        parseUsageLimitsConfig({
          providers: { "alibaba-token-plan": { region: "unknown" } },
        })
      )
    ).toBe(true);
    expect(pluginProviderForOpenCode("alibaba")).toBe("alibaba-token-plan");
    expect(pluginProviderForOpenCode("alibaba-cn")).toBe("alibaba-token-plan");
    expect(pluginProviderForOpenCode("qwen")).toBe("qwen");
  });
});
