import { Clock, Effect, Result } from "effect";

import { ProviderResponseDecodeError } from "@/errors.ts";
import type { ProviderDefinition } from "@/providers/definition.ts";
import { isJsonNumber } from "@/providers/json.ts";
import { ProviderCommandExecutor } from "@/providers/runtime/command.ts";
import type { UsageWindow } from "@/types.ts";
import {
  parseUsagePercentage,
  percentageQuota,
  resetInstantOrNull,
} from "@/usage.ts";
import { isRecord } from "@/utils.ts";

// Contract: modelstudioai/cli packages/commands/src/commands/usage/token-plan.ts.
// Despite their names, *Percentage fields are fractions (0..1), not 0..100.
const PROVIDER_ID = "alibaba-token-plan";
const MINIMUM_CLI_VERSION = [1, 15, 0] as const;
const WINDOW_FIELDS = [
  {
    kind: "rolling",
    label: "5h",
    ratio: "per5HourPercentage",
    reset: "per5HourResetTime",
  },
  {
    kind: "weekly",
    label: "weekly",
    ratio: "per1WeekPercentage",
    reset: "per1WeekResetTime",
  },
] as const;

const parseWindows = (raw: string): UsageWindow[] => {
  const payload: unknown = JSON.parse(raw);
  if (!isRecord(payload)) {
    throw new Error("Invalid Token Plan response");
  }
  const windows = WINDOW_FIELDS.flatMap((field): UsageWindow[] => {
    const ratio = payload[field.ratio];
    if (ratio === undefined || ratio === null) {
      return [];
    }
    if (!isJsonNumber(ratio)) {
      throw new TypeError("Invalid Token Plan ratio");
    }
    const percentage = parseUsagePercentage(ratio * 100);
    if (Result.isFailure(percentage)) {
      throw new Error("Invalid Token Plan ratio");
    }
    const reset = payload[field.reset];
    return [
      {
        kind: field.kind,
        label: field.label,
        quota: percentageQuota(percentage.success),
        resetsAt:
          isJsonNumber(reset) && reset > 0
            ? resetInstantOrNull(new Date(reset))
            : null,
      },
    ];
  });
  if (windows.length === 0) {
    throw new Error("Token Plan usage windows unavailable");
  }
  return windows;
};

const parseCliVersion = (raw: string): [number, number, number] | null => {
  const match = raw.match(
    /(?:\bbl\b|\bBailian CLI\b)\s+(?:version\s+)?v?(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:\D|$)/iu
  );
  if (!match?.groups) {
    return null;
  }
  return [
    Number(match.groups.major),
    Number(match.groups.minor),
    Number(match.groups.patch),
  ];
};

const hasMinimumCliVersion = (actual: readonly number[]): boolean => {
  const firstDifference = actual.findIndex(
    (part, index) => part !== MINIMUM_CLI_VERSION[index]
  );
  if (firstDifference === -1) {
    return true;
  }
  const actualPart = actual[firstDifference];
  const minimumPart = MINIMUM_CLI_VERSION[firstDifference];
  return (
    actualPart !== undefined &&
    minimumPart !== undefined &&
    actualPart > minimumPart
  );
};

/** Reads Personal/Solo quota through Bailian's console API client, without scraping a browser. */
export const alibabaTokenPlanProvider = {
  defaultLabel: "Alibaba Token Plan",
  displayOrder: 6,
  fetch: (config, _auth, timeoutMs) =>
    Effect.gen(function* fetchAlibabaTokenPlan() {
      const commands = yield* ProviderCommandExecutor;
      const china = config?.region === "china";
      const version = yield* commands.execute({
        args: ["--version"],
        command: "bl",
        providerID: PROVIDER_ID,
        timeoutMs,
      });
      const parsedVersion = parseCliVersion(version);
      if (parsedVersion === null) {
        return yield* new ProviderResponseDecodeError({
          cause: "invalid-version",
          operation: "run-command",
          providerID: PROVIDER_ID,
        });
      }
      if (!hasMinimumCliVersion(parsedVersion)) {
        return yield* new ProviderResponseDecodeError({
          cause: "unsupported",
          operation: "run-command",
          providerID: PROVIDER_ID,
        });
      }
      const raw = yield* commands.execute({
        args: [
          "usage",
          "token-plan",
          "--console-region",
          china ? "cn-beijing" : "ap-southeast-1",
          "--console-site",
          china ? "domestic" : "international",
          "--output",
          "json",
        ],
        command: "bl",
        providerID: PROVIDER_ID,
        timeoutMs,
      });
      const windows = yield* Effect.try({
        catch: () =>
          new ProviderResponseDecodeError({
            cause: "decode",
            operation: "decode-response",
            providerID: PROVIDER_ID,
          }),
        try: () => parseWindows(raw),
      });
      return {
        capturedAt: new Date(yield* Clock.currentTimeMillis),
        id: PROVIDER_ID,
        label: config?.label ?? "Alibaba Token Plan",
        windows,
      };
    }),
  footerWindowKind: "rolling",
  id: PROVIDER_ID,
  openCodeProviderIDs: ["alibaba", "alibaba-cn", "alibaba-token-plan"],
} as const satisfies ProviderDefinition<"alibaba-token-plan">;
