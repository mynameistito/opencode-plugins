import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  MissingProviderCredentialsError,
  ProviderResponseDecodeError,
  ProviderTransportError,
} from "@/errors.ts";
import { fetchNovitaAiBalanceUsage } from "@/providers/novita-ai.ts";

import { installFetchMock, resetFetchMock } from "./helpers.ts";

const response = (availableBalance: string | undefined) =>
  Response.json(availableBalance === undefined ? {} : { availableBalance });

describe("Novita AI provider", () => {
  afterEach(() => {
    resetFetchMock();
    delete process.env.NOVITA_API_KEY;
  });

  it("requests the balance endpoint and converts $100 to USD", async () => {
    const fetchMock = installFetchMock(response("1000000"));

    const usage = await fetchNovitaAiBalanceUsage(
      { apiKey: "novita-key" },
      {},
      1000
    );

    expect(fetchMock.mock.calls[0]).toMatchObject([
      "https://api.novita.ai/openapi/v1/billing/balance/detail",
      {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer novita-key",
        },
        method: "GET",
      },
    ]);
    expect(usage).toMatchObject({
      id: "novita-ai",
      label: "Novita AI",
      windows: [
        {
          kind: "credits",
          label: "balance",
          quota: { _tag: "Balance", remaining: 100, unit: "USD" },
          resetsAt: null,
        },
      ],
    });
  });

  it("converts whole-dollar and sub-cent amounts without using other fields", async () => {
    installFetchMock(
      Response.json({
        availableBalance: "1",
        cashBalance: "999999999",
        creditBalance: "999999999",
        debtBalance: "999999999",
      })
    );

    const usage = await fetchNovitaAiBalanceUsage({ apiKey: "key" }, {}, 1000);

    expect(usage.windows[0]?.quota).toStrictEqual({
      _tag: "Balance",
      remaining: 0.0001,
      unit: "USD",
    });

    installFetchMock(response("10000"));
    const dollarUsage = await fetchNovitaAiBalanceUsage(
      { apiKey: "key" },
      {},
      1000
    );
    expect(dollarUsage.windows[0]?.quota).toMatchObject({
      remaining: 1,
      unit: "USD",
    });

    installFetchMock(response("00010000"));
    const paddedUsage = await fetchNovitaAiBalanceUsage(
      { apiKey: "key" },
      {},
      1000
    );
    expect(paddedUsage.windows[0]?.quota).toMatchObject({
      remaining: 1,
      unit: "USD",
    });
  });

  it("preserves a zero balance", async () => {
    installFetchMock(response("0"));

    const usage = await fetchNovitaAiBalanceUsage({ apiKey: "key" }, {}, 1000);

    expect(usage.windows[0]?.quota).toStrictEqual({
      _tag: "Balance",
      remaining: 0,
      unit: "USD",
    });
  });

  it.each([
    ["missing field", undefined],
    ["empty string", ""],
    ["negative amount", "-1"],
    ["fractional minor unit", "1.5"],
    ["exponent", "1e4"],
    ["nonnumeric", "NaN"],
    ["oversized decimal amount", "10000000000000000"],
    ["unsafe numeric amount", "9007199254740992"],
  ] as const)("rejects %s", async (_name, amount) => {
    installFetchMock(response(amount));

    await expect(
      fetchNovitaAiBalanceUsage({ apiKey: "key" }, {}, 1000)
    ).rejects.toBeInstanceOf(ProviderResponseDecodeError);
  });

  it("accepts the largest safe integer amount", async () => {
    installFetchMock(response("9007199254740991"));

    const usage = await fetchNovitaAiBalanceUsage({ apiKey: "key" }, {}, 1000);

    expect(usage.windows[0]?.quota).toMatchObject({
      remaining: Number.MAX_SAFE_INTEGER / 10_000,
      unit: "USD",
    });
  });

  it("uses auto-discovered OpenCode auth on the exact official origin", async () => {
    const fetchMock = installFetchMock(response("10000"));

    await fetchNovitaAiBalanceUsage(
      {},
      { "novita-ai": { key: "open-code-key" } },
      1000
    );

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer open-code-key" },
    });
  });

  it("does not send auto-discovered auth to a custom origin", async () => {
    await expect(
      fetchNovitaAiBalanceUsage(
        { baseUrl: "https://novita.example.test" },
        { "novita-ai": { key: "open-code-key" } },
        1000
      )
    ).rejects.toBeInstanceOf(MissingProviderCredentialsError);

    const fetchMock = installFetchMock(response("10000"));
    await fetchNovitaAiBalanceUsage(
      {
        apiKey: "explicit-key",
        baseUrl: "https://novita.example.test/v1?tenant=example#balance",
      },
      { "novita-ai": { key: "open-code-key" } },
      1000
    );

    expect(fetchMock.mock.calls[0]).toMatchObject([
      "https://novita.example.test/v1/openapi/v1/billing/balance/detail?tenant=example",
      { headers: { Authorization: "Bearer explicit-key" } },
    ]);
  });

  it("supports authPath and explicit environment credentials", async () => {
    const authPath = path.join(
      tmpdir(),
      `oc-usage-limits-novita-ai-${crypto.randomUUID()}.json`
    );
    await writeFile(
      authPath,
      JSON.stringify({ "novita-ai": { apiKey: "file-key" } })
    );
    try {
      const fetchMock = installFetchMock(response("10000"));
      await fetchNovitaAiBalanceUsage(
        { apiKey: "config-key", authPath },
        {},
        1000
      );
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        headers: { Authorization: "Bearer file-key" },
      });
    } finally {
      await rm(authPath, { force: true });
    }

    process.env.NOVITA_API_KEY = "environment-key";
    const fetchMock = installFetchMock(response("10000"));
    await fetchNovitaAiBalanceUsage(
      { apiKey: "{env:NOVITA_API_KEY}" },
      {},
      1000
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer environment-key" },
    });
  });

  it("accepts flat auth-file credentials and ignores unrelated auth data", async () => {
    const authPath = path.join(
      tmpdir(),
      `oc-usage-limits-novita-ai-flat-${crypto.randomUUID()}.json`
    );
    await writeFile(authPath, JSON.stringify({ key: "file-key" }));
    try {
      const fetchMock = installFetchMock(response("10000"));
      await fetchNovitaAiBalanceUsage({ authPath }, {}, 1000);
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        headers: { Authorization: "Bearer file-key" },
      });
    } finally {
      await rm(authPath, { force: true });
    }

    const emptyAuthPath = path.join(
      tmpdir(),
      `oc-usage-limits-novita-ai-empty-${crypto.randomUUID()}.json`
    );
    await writeFile(emptyAuthPath, JSON.stringify({ ignored: true }));
    try {
      const fetchMock = installFetchMock(response("10000"));
      await fetchNovitaAiBalanceUsage(
        { apiKey: "config-key", authPath: emptyAuthPath },
        {},
        1000
      );
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        headers: { Authorization: "Bearer config-key" },
      });
    } finally {
      await rm(emptyAuthPath, { force: true });
    }
  });

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [500, "http"],
  ] as const)(
    "classifies Novita AI HTTP %d as a safe transport error",
    async (status, cause) => {
      installFetchMock(Response.json({ error: "secret-key" }, { status }));
      const request = fetchNovitaAiBalanceUsage(
        { apiKey: "secret-key" },
        {},
        1000
      );
      await expect(request).rejects.toBeInstanceOf(ProviderTransportError);
      await expect(request).rejects.not.toThrow("secret-key");
      await expect(request).rejects.toMatchObject({
        cause,
        providerID: "novita-ai",
      });
    }
  );
});
