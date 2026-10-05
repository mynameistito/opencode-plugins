import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ProviderResponseDecodeError } from "@/errors.ts";
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
});
