import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ProviderRateLimitError,
  ProviderResponseDecodeError,
  ProviderTransportError,
} from "@/errors.ts";
import { fetchDeepSeekBalanceUsage } from "@/providers/deepseek.ts";

import { installFetchMock, resetFetchMock } from "./helpers.ts";

interface BalanceInfoInput {
  readonly currency?: string;
  readonly granted_balance?: string | null;
  readonly topped_up_balance?: string | null;
  readonly total_balance?: string | null;
}

const balance = (overrides: BalanceInfoInput = {}): BalanceInfoInput => ({
  currency: "USD",
  granted_balance: "10.00",
  topped_up_balance: "2.50",
  total_balance: "12.50",
  ...overrides,
});

const response = (
  balanceInfos: readonly BalanceInfoInput[],
  isAvailable = true
) => Response.json({ balance_infos: balanceInfos, is_available: isAvailable });

const regressionApiKey = "deepseek-regression-api-key";

const rejectDeepSeekRequest = async (status: number): Promise<Error> => {
  installFetchMock(
    Response.json(
      { error: regressionApiKey },
      {
        headers: { "retry-after": "later" },
        status,
      }
    )
  );
  try {
    await fetchDeepSeekBalanceUsage({ apiKey: regressionApiKey }, {}, 1000);
  } catch (error) {
    if (error instanceof Error) {
      return error;
    }
    return new Error(String(error));
  }
  return new Error(`expected DeepSeek request to reject with HTTP ${status}`);
};

const expectSafeProviderFailure = (error: Error, message: string): void => {
  expect(error.message).toBe(message);
  expect(String(error)).not.toContain(regressionApiKey);
  const serialized = JSON.stringify(error);
  expect(serialized).toBeDefined();
  expect(serialized).not.toContain(regressionApiKey);
};

describe("DeepSeek provider", () => {
  afterEach(resetFetchMock);

  it("requests the official balance endpoint and preserves currencies independently", async () => {
    const fetchMock = installFetchMock(
      response([
        balance(),
        balance({
          currency: "CNY",
          granted_balance: "0.00",
          topped_up_balance: "0.00",
          total_balance: "0.00",
        }),
      ])
    );

    const usage = await fetchDeepSeekBalanceUsage(
      { apiKey: "deepseek-key", label: "My DeepSeek" },
      {},
      1000
    );

    expect(fetchMock.mock.calls[0]).toMatchObject([
      "https://api.deepseek.com/user/balance",
      {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer deepseek-key",
        },
        method: "GET",
      },
    ]);
    expect(usage).toMatchObject({
      id: "deepseek",
      label: "My DeepSeek",
      windows: [
        {
          kind: "credits",
          label: "USD",
          quota: { _tag: "Balance", remaining: 12.5, unit: "USD" },
          resetsAt: null,
        },
        {
          kind: "credits",
          label: "CNY",
          quota: { _tag: "Balance", remaining: 0, unit: "CNY" },
          resetsAt: null,
        },
      ],
    });
  });

  it("keeps zero balances visible when the account is unavailable", async () => {
    installFetchMock(
      response(
        [
          balance({
            granted_balance: "0",
            topped_up_balance: "0",
            total_balance: "0",
          }),
        ],
        false
      )
    );

    const usage = await fetchDeepSeekBalanceUsage(
      { apiKey: "deepseek-key" },
      {},
      1000
    );

    expect(usage.metadata).toStrictEqual({ isAvailable: false });
    expect(usage.windows[0]?.quota).toStrictEqual({
      _tag: "Balance",
      remaining: 0,
      unit: "USD",
    });
  });

  it("skips malformed entries when another valid balance remains", async () => {
    installFetchMock(
      response([
        balance({ total_balance: "-1" }),
        balance({
          currency: "EUR",
          granted_balance: "1.00",
          topped_up_balance: "2.00",
          total_balance: "3.00",
        }),
        balance({ granted_balance: "not-a-decimal" }),
      ])
    );

    const usage = await fetchDeepSeekBalanceUsage(
      { apiKey: "deepseek-key" },
      {},
      1000
    );

    expect(usage.windows).toHaveLength(1);
    expect(usage.windows[0]).toMatchObject({
      label: "EUR",
      quota: { _tag: "Balance", remaining: 3, unit: "EUR" },
    });
  });

  it.each([
    ["missing total_balance", { total_balance: null }],
    ["negative total_balance", { total_balance: "-1" }],
    ["exponent total_balance", { total_balance: "1e3" }],
    ["NaN total_balance", { total_balance: "NaN" }],
    ["infinite total_balance", { total_balance: "Infinity" }],
    ["negative granted_balance", { granted_balance: "-1" }],
    ["infinite topped_up_balance", { topped_up_balance: "Infinity" }],
  ] as const)(
    "fails closed when all balances have %s",
    async (_label, overrides) => {
      installFetchMock(response([balance(overrides)]));

      const result = fetchDeepSeekBalanceUsage(
        { apiKey: "deepseek-key" },
        {},
        1000
      );
      await expect(result).rejects.toBeInstanceOf(ProviderResponseDecodeError);
      await expect(result).rejects.toThrow("invalid DeepSeek usage");
    }
  );

  it("requires the complete response envelope", async () => {
    installFetchMock(Response.json({ balance_infos: [balance()] }));

    await expect(
      fetchDeepSeekBalanceUsage({ apiKey: "deepseek-key" }, {}, 1000)
    ).rejects.toBeInstanceOf(ProviderResponseDecodeError);
  });

  it.each([
    [401, "unauthorized", "provider credentials were rejected"],
    [403, "forbidden", "provider access was forbidden"],
    [500, "http", "provider request failed (HTTP 500)"],
  ] as const)(
    "classifies DeepSeek HTTP %d as a safe transport error",
    async (status, cause, message) => {
      const error = await rejectDeepSeekRequest(status);

      expect(error).toBeInstanceOf(ProviderTransportError);
      if (!(error instanceof ProviderTransportError)) {
        return;
      }
      expect(error.cause).toBe(cause);
      expect(error.operation).toBe("fetch-usage");
      expect(error.providerID).toBe("deepseek");
      expect(error.status).toBe(status);
      expectSafeProviderFailure(error, message);
    }
  );

  it("classifies DeepSeek rate limits without leaking the API key", async () => {
    const error = await rejectDeepSeekRequest(429);

    expect(error).toBeInstanceOf(ProviderRateLimitError);
    if (!(error instanceof ProviderRateLimitError)) {
      return;
    }
    expect(error.operation).toBe("fetch-usage");
    expect(error.providerID).toBe("deepseek");
    expect(error.retryAfterMs).toBeUndefined();
    expectSafeProviderFailure(error, "provider rate limit reached");
  });

  it("uses authPath before OpenCode auth and configured credentials", async () => {
    const authPath = path.join(
      tmpdir(),
      `oc-usage-limits-deepseek-${crypto.randomUUID()}.json`
    );
    await writeFile(
      authPath,
      JSON.stringify({ deepseek: { key: "file-key" } })
    );
    try {
      const fetchMock = installFetchMock(response([balance()]));

      await fetchDeepSeekBalanceUsage(
        { apiKey: "config-key", authPath },
        { deepseek: { key: "open-code-key" } },
        1000
      );

      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        headers: { Authorization: "Bearer file-key" },
      });
    } finally {
      await rm(authPath, { force: true });
    }
  });

  it("uses the DeepSeek OpenCode auth provider before configured credentials", async () => {
    const fetchMock = installFetchMock(response([balance()]));

    await fetchDeepSeekBalanceUsage(
      { apiKey: "config-key" },
      { deepseek: { apiKey: "open-code-key" } },
      1000
    );

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer open-code-key" },
    });
  });

  it("resolves the explicit DeepSeek environment credential", async () => {
    process.env.DEEPSEEK_API_KEY = "environment-key";
    const fetchMock = installFetchMock(response([balance()]));

    await fetchDeepSeekBalanceUsage(
      { apiKey: "{env:DEEPSEEK_API_KEY}" },
      {},
      1000
    );

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer environment-key" },
    });
  });

  it("requires explicit credentials for custom base URLs", async () => {
    await expect(
      fetchDeepSeekBalanceUsage(
        { baseUrl: "https://deepseek.example.test" },
        { deepseek: { key: "open-code-key" } },
        1000
      )
    ).rejects.toThrow("missing DeepSeek key");

    const fetchMock = installFetchMock(response([balance()]));
    await fetchDeepSeekBalanceUsage(
      { apiKey: "explicit-key", baseUrl: "https://deepseek.example.test" },
      { deepseek: { key: "open-code-key" } },
      1000
    );
    expect(fetchMock.mock.calls[0]).toMatchObject([
      "https://deepseek.example.test/user/balance",
      { headers: { Authorization: "Bearer explicit-key" } },
    ]);
  });

  it("appends the balance path before query and fragment components", async () => {
    const fetchMock = installFetchMock(response([balance()]));

    await fetchDeepSeekBalanceUsage(
      {
        apiKey: "explicit-key",
        baseUrl: "https://deepseek.example.test/v1?tenant=example#balance",
      },
      {},
      1000
    );

    expect(fetchMock.mock.calls[0]).toMatchObject([
      "https://deepseek.example.test/v1/user/balance?tenant=example",
      { headers: { Authorization: "Bearer explicit-key" } },
    ]);
  });
});
