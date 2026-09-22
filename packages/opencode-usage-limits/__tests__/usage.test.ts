import { Result } from "effect";
import { describe, expect, test } from "vitest";

import {
  countQuota,
  parseUsageCount,
  parseUsagePercentage,
  parseUsageResetInstant,
} from "@/usage.ts";
import type { Percentage, QuotaCount } from "@/usage.ts";

type IsAssignable<From, To> = From extends To ? true : false;
const plainNumberIsPercentage: IsAssignable<number, Percentage> = false;
const plainNumberIsQuotaCount: IsAssignable<number, QuotaCount> = false;

describe("usage domain invariants", () => {
  test("keeps refined numeric types nominal", () => {
    expect(plainNumberIsPercentage).toBeFalsy();
    expect(plainNumberIsQuotaCount).toBeFalsy();
  });

  test.each([0, 42.5, 100])("accepts finite percentage %s", (value) => {
    expect(Result.isSuccess(parseUsagePercentage(value))).toBeTruthy();
  });

  test.each([-1, 101, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid percentage %s",
    (value) => {
      expect(Result.isFailure(parseUsagePercentage(value))).toBeTruthy();
    }
  );

  test("accepts only finite non-negative counts", () => {
    expect(Result.isSuccess(parseUsageCount(0))).toBeTruthy();
    expect(Result.isSuccess(parseUsageCount(12.5))).toBeTruthy();
    expect(Result.isFailure(parseUsageCount(-1))).toBeTruthy();
    expect(
      Result.isFailure(parseUsageCount(Number.POSITIVE_INFINITY))
    ).toBeTruthy();
  });

  test("rejects count quotas whose current value exceeds the total", () => {
    const current = Result.getOrThrow(parseUsageCount(20));
    const total = Result.getOrThrow(parseUsageCount(10));
    const used = Result.getOrThrow(parseUsagePercentage(100));

    expect(() => countQuota(current, total, used)).toThrow(
      "quota current count cannot exceed total count"
    );
  });

  test("accepts only valid Date reset instants", () => {
    expect(
      Result.isSuccess(
        parseUsageResetInstant(new Date("2026-08-14T12:00:00.000Z"))
      )
    ).toBeTruthy();
    expect(
      Result.isFailure(parseUsageResetInstant(new Date("invalid date")))
    ).toBeTruthy();
    expect(Result.isFailure(parseUsageResetInstant("2026-08-14"))).toBeTruthy();
  });
});
