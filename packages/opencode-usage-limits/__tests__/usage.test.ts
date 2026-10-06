import { Result } from "effect";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  balanceQuota,
  countQuota,
  parseUsageBalance,
  parseUsageBalanceAmount,
  parseUsageCount,
  parseUsagePercentage,
  parseUsageResetInstant,
  quotaUsedPercent,
} from "@/usage.ts";
import type { BalanceQuota, Percentage, QuotaCount } from "@/usage.ts";

describe("usage domain invariants", () => {
  it("keeps refined numeric types nominal", () => {
    expectTypeOf<number>().not.toMatchTypeOf<Percentage>();
    expectTypeOf<number>().not.toMatchTypeOf<QuotaCount>();
    expectTypeOf<number>().not.toMatchTypeOf<BalanceQuota>();
  });

  it.each([0, 42.5, 100])("accepts finite percentage %s", (value) => {
    expect(Result.isSuccess(parseUsagePercentage(value))).toBeTruthy();
  });

  it.each([-1, 101, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid percentage %s",
    (value) => {
      expect(Result.isFailure(parseUsagePercentage(value))).toBeTruthy();
    }
  );

  it("accepts only finite non-negative counts", () => {
    expect(Result.isSuccess(parseUsageCount(0))).toBeTruthy();
    expect(Result.isSuccess(parseUsageCount(12.5))).toBeTruthy();
    expect(Result.isFailure(parseUsageCount(-1))).toBeTruthy();
    expect(
      Result.isFailure(parseUsageCount(Number.POSITIVE_INFINITY))
    ).toBeTruthy();
  });

  it("constructs a remaining balance without usage percentages", () => {
    const remaining = Result.getOrThrow(parseUsageBalance(12.34));
    const quota = balanceQuota(remaining, "USD");

    expect(quota).toStrictEqual({
      _tag: "Balance",
      remaining: 12.34,
      unit: "USD",
    });
    expect(quotaUsedPercent(quota)).toBeNull();
  });

  it.each([0, 12.5])("accepts finite non-negative balances %s", (value) => {
    expect(Result.isSuccess(parseUsageBalance(value))).toBeTruthy();
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, "12.5"])(
    "rejects invalid balance amount %s",
    (value) => {
      expect(Result.isFailure(parseUsageBalance(value))).toBeTruthy();
    }
  );

  it("accepts signed finite authoritative balance amounts", () => {
    expect(Result.isSuccess(parseUsageBalanceAmount(-2.5))).toBeTruthy();
    expect(Result.isSuccess(parseUsageBalanceAmount(0))).toBeTruthy();
    expect(
      Result.isFailure(parseUsageBalanceAmount(Number.NEGATIVE_INFINITY))
    ).toBeTruthy();
  });

  it("rejects count quotas whose current value exceeds the total", () => {
    const current = Result.getOrThrow(parseUsageCount(20));
    const total = Result.getOrThrow(parseUsageCount(10));
    const used = Result.getOrThrow(parseUsagePercentage(100));

    expect(() => countQuota(current, total, used)).toThrow(
      "quota current count cannot exceed total count"
    );
  });

  it("accepts only valid Date reset instants", () => {
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
