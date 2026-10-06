import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ProviderResponseDecodeError,
  ProviderTransportError,
} from "@/errors.ts";
import {
  fetchMoonshotAiBalanceUsage,
  fetchMoonshotAiCnBalanceUsage,
} from "@/providers/moonshotai.ts";

import { installFetchMock, resetFetchMock } from "./helpers.ts";

const response = (
  availableBalance: number,
  overrides: { readonly code?: number; readonly status?: boolean } = {}
) =>
  Response.json({
    code: 0,
    data: {
      available_balance: availableBalance,
      cash_balance: -100,
      voucher_balance: 200,
    },
    scode: "0x0",
    status: true,
    ...overrides,
  });

describe("Moonshot/Kimi API balance providers", () => {
  afterEach(resetFetchMock);

  it.each([
    [
      "global USD",
      "moonshotai",
      fetchMoonshotAiBalanceUsage,
      "https://api.moonshot.ai/v1/users/me/balance",
      "USD",
      49.58894,
    ],
    [
      "China CNY",
      "moonshotai-cn",
      fetchMoonshotAiCnBalanceUsage,
      "https://api.moonshot.cn/v1/users/me/balance",
      "CNY",
      49.58894,
    ],
  ] as const)(
    "fetches the %s balance using available_balance",
    async (_name, id, fetchBalance, url, currency, amount) => {
      const fetchMock = installFetchMock(response(amount));
      const usage = await fetchBalance({ apiKey: "region-key" }, {}, 1000);

      expect(fetchMock.mock.calls[0]).toMatchObject([
        url,
        {
          headers: {
            Accept: "application/json",
            Authorization: "Bearer region-key",
          },
          method: "GET",
        },
      ]);
      expect(usage).toMatchObject({
        id,
        windows: [
          {
            kind: "credits",
            label: `${currency} balance`,
            quota: { _tag: "Balance", remaining: amount, unit: currency },
            resetsAt: null,
          },
        ],
      });
    }
  );

  it.each([0, -3.25])("preserves a %s available balance", async (amount) => {
    installFetchMock(response(amount));

    const usage = await fetchMoonshotAiBalanceUsage(
      { apiKey: "global-key" },
      {},
      1000
    );

    expect(usage.windows[0]?.quota).toStrictEqual({
      _tag: "Balance",
      remaining: amount,
      unit: "USD",
    });
  });

  it.each([
    ["non-object response", null],
    ["missing data", { code: 0, status: true }],
    ["missing available balance", { code: 0, data: {}, status: true }],
    ["non-object data", { code: 0, data: null, status: true }],
    [
      "string balance",
      { code: 0, data: { available_balance: "1.25" }, status: true },
    ],
    ["missing status", { code: 0, data: { available_balance: 1 } }],
    [
      "business failure",
      { code: 0, data: { available_balance: 1 }, status: false },
    ],
    ["nonzero code", { code: 1, data: { available_balance: 1 }, status: true }],
  ] as const)("fails closed for %s", async (_label, payload) => {
    installFetchMock(Response.json(payload));

    await expect(
      fetchMoonshotAiBalanceUsage({ apiKey: "global-key" }, {}, 1000)
    ).rejects.toBeInstanceOf(ProviderResponseDecodeError);
  });

  it("rejects numeric overflow as a non-finite balance", async () => {
    installFetchMock(
      new Response(
        '{"code":0,"status":true,"data":{"available_balance":1e999}}',
        { headers: { "content-type": "application/json" } }
      )
    );

    await expect(
      fetchMoonshotAiBalanceUsage({ apiKey: "global-key" }, {}, 1000)
    ).rejects.toBeInstanceOf(ProviderResponseDecodeError);
  });

  it("classifies HTTP 401 as a safe transport error", async () => {
    installFetchMock(Response.json({}, { status: 401 }));

    await expect(
      fetchMoonshotAiBalanceUsage({ apiKey: "global-key" }, {}, 1000)
    ).rejects.toBeInstanceOf(ProviderTransportError);
  });

  it("uses only each provider's matching OpenCode credential", async () => {
    const globalMock = installFetchMock(response(1));
    await fetchMoonshotAiBalanceUsage(
      {},
      {
        moonshotai: { key: "global-key" },
        "moonshotai-cn": { key: "china-key" },
      },
      1000
    );
    expect(globalMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer global-key" },
    });

    const chinaMock = installFetchMock(response(2));
    await fetchMoonshotAiCnBalanceUsage(
      {},
      {
        moonshotai: { key: "global-key" },
        "moonshotai-cn": { key: "china-key" },
      },
      1000
    );
    expect(chinaMock.mock.calls[0]).toMatchObject([
      "https://api.moonshot.cn/v1/users/me/balance",
      { headers: { Authorization: "Bearer china-key" } },
    ]);
  });

  it("reads region-specific credentials from the configured auth file", async () => {
    const authPath = path.join(
      tmpdir(),
      `oc-usage-limits-moonshot-${crypto.randomUUID()}.json`
    );
    await writeFile(
      authPath,
      JSON.stringify({
        moonshotai: { key: "auth-file-global" },
        "moonshotai-cn": { apiKey: "auth-file-china" },
      })
    );
    try {
      const globalMock = installFetchMock(response(1));
      await fetchMoonshotAiBalanceUsage({ authPath }, {}, 1000);
      expect(globalMock.mock.calls[0]?.[1]).toMatchObject({
        headers: { Authorization: "Bearer auth-file-global" },
      });

      const chinaMock = installFetchMock(response(2));
      await fetchMoonshotAiCnBalanceUsage({ authPath }, {}, 1000);
      expect(chinaMock.mock.calls[0]?.[1]).toMatchObject({
        headers: { Authorization: "Bearer auth-file-china" },
      });
    } finally {
      await rm(authPath, { force: true });
    }
  });

  it("accepts direct auth-file keys and ignores malformed provider entries", async () => {
    const authPath = path.join(
      tmpdir(),
      `oc-usage-limits-moonshot-direct-${crypto.randomUUID()}.json`
    );
    await writeFile(authPath, JSON.stringify({ apiKey: "direct-file-key" }));
    try {
      const fetchMock = installFetchMock(response(1));
      await fetchMoonshotAiBalanceUsage({ authPath }, {}, 1000);
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        headers: { Authorization: "Bearer direct-file-key" },
      });
    } finally {
      await rm(authPath, { force: true });
    }

    const malformedPath = path.join(
      tmpdir(),
      `oc-usage-limits-moonshot-malformed-${crypto.randomUUID()}.json`
    );
    await writeFile(malformedPath, JSON.stringify({ moonshotai: null }));
    try {
      const fetchMock = installFetchMock(response(1));
      await fetchMoonshotAiBalanceUsage(
        { apiKey: "explicit-fallback", authPath: malformedPath },
        {},
        1000
      );
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        headers: { Authorization: "Bearer explicit-fallback" },
      });
    } finally {
      await rm(malformedPath, { force: true });
    }
  });

  it("does not cross-send a region key when the matching credential is absent", async () => {
    await expect(
      fetchMoonshotAiBalanceUsage(
        {},
        { "moonshotai-cn": { key: "china-key" } },
        1000
      )
    ).rejects.toThrow("missing Moonshot AI key");
    await expect(
      fetchMoonshotAiCnBalanceUsage(
        {},
        { moonshotai: { key: "global-key" } },
        1000
      )
    ).rejects.toThrow("missing Moonshot AI CN key");
  });

  it.each([
    [
      "global",
      fetchMoonshotAiBalanceUsage,
      "https://proxy.example.test",
      { moonshotai: { key: "discovered" } },
    ],
    [
      "China",
      fetchMoonshotAiCnBalanceUsage,
      "https://api.moonshot.ai",
      { "moonshotai-cn": { key: "discovered" } },
    ],
  ] as const)(
    "requires explicit credentials for custom %s origins",
    async (_label, fetchBalance, baseUrl, auth) => {
      await expect(fetchBalance({ baseUrl }, auth, 1000)).rejects.toThrow(
        "missing Moonshot"
      );

      const fetchMock = installFetchMock(response(1));
      await fetchBalance({ apiKey: "explicit-key", baseUrl }, auth, 1000);
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        headers: { Authorization: "Bearer explicit-key" },
      });
    }
  );
});
