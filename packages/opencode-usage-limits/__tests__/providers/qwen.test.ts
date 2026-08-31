import { describe, expect, test } from "bun:test";

import { Effect, Exit, Layer } from "effect";

import { ProviderCommandError, ProviderTimeoutError } from "@/errors.ts";
import { qwenProvider } from "@/providers/qwen.ts";
import { ProviderClock } from "@/providers/runtime/clock.ts";
import { ProviderCommandExecutor } from "@/providers/runtime/command.ts";
import type { ProviderCommandInput } from "@/providers/runtime/command.ts";
import { ProviderEnvironmentLive } from "@/providers/runtime/environment.ts";
import { ProviderFileSystemLive } from "@/providers/runtime/filesystem.ts";
import { ProviderHttpClientLive } from "@/providers/runtime/http.ts";

const NOW = new Date("2026-08-14T12:00:00.000Z");

type CommandResult = string | ProviderCommandError | ProviderTimeoutError;

const authenticated = JSON.stringify({
  authenticated: true,
  server_verified: true,
});

const createRuntime = (auth: CommandResult, usage: CommandResult = "") => {
  const calls: ProviderCommandInput[] = [];
  const commands = Layer.succeed(ProviderCommandExecutor, {
    execute: (input) => {
      calls.push(input);
      const result = input.args[0] === "auth" ? auth : usage;
      return result instanceof Error
        ? Effect.fail(result)
        : Effect.succeed(result);
    },
  });
  const clock = Layer.succeed(ProviderClock, {
    after: () => Effect.succeed(null),
    now: Effect.succeed(NOW),
  });

  return {
    calls,
    runtime: Layer.mergeAll(
      commands,
      clock,
      ProviderEnvironmentLive,
      ProviderFileSystemLive,
      ProviderHttpClientLive
    ),
  };
};

const fetchUsage = (
  runtime: ReturnType<typeof createRuntime>["runtime"],
  label?: string
) =>
  Effect.runPromise(
    qwenProvider
      .fetch(label ? { label } : undefined, {}, 4321)
      .pipe(Effect.provide(runtime))
  );

const fetchUsageExit = (runtime: ReturnType<typeof createRuntime>["runtime"]) =>
  Effect.runPromiseExit(
    qwenProvider.fetch(undefined, {}, 4321).pipe(Effect.provide(runtime))
  );

const expectFailure = <ErrorTag extends string>(
  exit: Exit.Exit<unknown, { readonly _tag: ErrorTag }>,
  tag: ErrorTag
) => {
  expect(Exit.isFailure(exit)).toBe(true);
  if (Exit.isFailure(exit)) {
    const serialized = JSON.stringify(exit.cause);
    expect(serialized).toContain(`"_tag":"${tag}"`);
    return serialized;
  }
  throw new Error("expected provider fetch failure");
};

describe("Qwen provider", () => {
  test("fetches authenticated usage through the runtime services", async () => {
    const { calls, runtime } = createRuntime(
      authenticated,
      JSON.stringify({
        token_plan: {
          planName: "Plus",
          remainingCredits: 250,
          resetDate: "2026-08-14T13:00:01.000Z",
          subscribed: true,
          totalCredits: 1000,
          usedPct: 75,
        },
      })
    );

    const usage = await fetchUsage(runtime);

    expect(calls).toEqual([
      {
        acceptedExitCodes: new Set([2]),
        args: ["auth", "status", "--format", "json"],
        command: "qwencloud",
        providerID: "qwen",
        timeoutMs: 4321,
      },
      {
        args: ["usage", "summary", "--format", "json"],
        command: "qwencloud",
        providerID: "qwen",
        timeoutMs: 4321,
      },
    ]);
    expect(usage).toMatchObject({
      capturedAt: NOW,
      id: "qwen",
      label: "Plus",
      windows: [
        {
          label: "credits",
          quota: {
            current: 750,
            remainingPercent: 25,
            total: 1000,
            usedPercent: 75,
          },
        },
      ],
    });
    expect(usage.windows[0]?.resetsAt?.toISOString()).toBe(
      "2026-08-14T13:00:01.000Z"
    );
  });

  test("accepts exit code 2 auth JSON and reports missing credentials", async () => {
    const { calls, runtime } = createRuntime(
      JSON.stringify({ authenticated: false })
    );

    const exit = await fetchUsageExit(runtime);

    expect(calls[0]?.acceptedExitCodes).toEqual(new Set([2]));
    const serialized = expectFailure(exit, "MissingProviderCredentialsError");
    expect(serialized).toContain('"operation":"run-command"');
    expect(serialized).toContain('"providerID":"qwen"');
  });

  test.each([
    ["auth", "{", "decode"],
    ["usage", authenticated, "decode"],
  ])(
    "classifies malformed %s JSON as a safe decode error",
    async (kind, auth, cause) => {
      const { runtime } = createRuntime(auth, kind === "usage" ? "{" : "");

      const exit = await fetchUsageExit(runtime);

      const serialized = expectFailure(exit, "ProviderResponseDecodeError");
      expect(serialized).toContain(`"cause":"${cause}"`);
      expect(serialized).toContain('"operation":"decode-response"');
      expect(serialized).toContain('"providerID":"qwen"');
    }
  );

  test("classifies a missing subscription as a safe schema error", async () => {
    const { runtime } = createRuntime(
      authenticated,
      JSON.stringify({ token_plan: { subscribed: false } })
    );

    const exit = await fetchUsageExit(runtime);

    const serialized = expectFailure(exit, "ProviderResponseDecodeError");
    expect(serialized).toContain('"cause":"schema"');
  });

  test.each([
    [
      "command failure",
      new ProviderCommandError({
        cause: "command",
        exitCode: 1,
        operation: "run-command",
        providerID: "qwen",
      }),
      "ProviderCommandError",
    ],
    [
      "timeout",
      new ProviderTimeoutError({
        cause: "timeout",
        operation: "run-command",
        providerID: "qwen",
        timeoutMs: 4321,
      }),
      "ProviderTimeoutError",
    ],
  ])("preserves safe %s classification", async (_name, error, tag) => {
    const { runtime } = createRuntime(error);

    const exit = await fetchUsageExit(runtime);

    const serialized = expectFailure(exit, tag);
    expect(serialized).toContain('"operation":"run-command"');
    expect(serialized).toContain('"providerID":"qwen"');
  });

  test("uses a configured provider label", async () => {
    const { runtime } = createRuntime(
      authenticated,
      JSON.stringify({
        token_plan: { planName: "Plus", subscribed: true, usedPct: 10 },
      })
    );

    const usage = await fetchUsage(runtime, "Work Qwen");

    expect(usage.label).toBe("Work Qwen");
  });
});
