import { afterEach, describe, expect, test, vi } from "vitest";

import { fetchCommandCodeUsage } from "@/providers/commandcode.ts";
import type { JsonObject, JsonValue } from "@/utils.ts";

import { resetFetchMock } from "./helpers.ts";

type FetchMock = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

const whoami = (orgId?: string | number) =>
  Response.json(
    orgId === undefined
      ? { success: true, user: { id: "user_fixture" } }
      : { org: { id: orgId }, success: true }
  );

const defaultWindowLimits: JsonObject = {
  fiveHour: { cap: 14, resetAt: 1_789_810_659_226, used: 7 },
  weekly: { cap: 35, resetAt: 1_790_397_459_226, used: 7 },
};

const defaultCredits: JsonObject = {
  freeCredits: 0,
  monthlyCredits: 70,
  purchasedCredits: 5,
};

const creditsWith = (windowLimits: JsonObject, accountCredits: JsonValue) =>
  Response.json({
    credits: accountCredits,
    windowLimits,
  });

const credits = () => creditsWith(defaultWindowLimits, defaultCredits);

const installResponses = (responses: readonly Response[]) => {
  let index = 0;
  const fetchMock = vi.fn<FetchMock>(() => {
    const response = responses[index];
    index += 1;
    if (!response) {
      throw new Error("Unexpected Command Code request");
    }
    return Promise.resolve(response);
  });
  globalThis.fetch = Object.assign(fetchMock, {
    preconnect: globalThis.fetch.preconnect,
  });
  return fetchMock;
};

describe("Command Code provider", () => {
  afterEach(resetFetchMock);

  test("reads and scopes credit windows and derives monthly usage", async () => {
    const fetchMock = installResponses([
      whoami("org_fixture"),
      credits(),
      Response.json({ totalCredits: 5 }),
    ]);

    const usage = await fetchCommandCodeUsage(
      undefined,
      { commandcode: { key: "cc-token" } },
      1000
    );

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toStrictEqual([
      "https://api.commandcode.ai/alpha/whoami?limits=1",
      "https://api.commandcode.ai/alpha/billing/credits?orgId=org_fixture",
      "https://api.commandcode.ai/alpha/usage/summary?orgId=org_fixture",
    ]);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer cc-token" },
      method: "GET",
    });
    expect(usage).toMatchObject({ id: "commandcode", label: "Command Code" });
    expect(usage.windows).toMatchObject([
      { kind: "rolling", label: "5h", quota: { usedPercent: 50 } },
      { kind: "weekly", quota: { usedPercent: 20 } },
      { kind: "monthly", quota: { usedPercent: 6.25 } },
    ]);
  });

  test("omits organization scope for personal accounts", async () => {
    const fetchMock = installResponses([
      whoami(),
      credits(),
      Response.json({ totalCredits: 5 }),
    ]);

    await fetchCommandCodeUsage(
      undefined,
      { commandcode: { key: "cc-token" } },
      1000
    );

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toStrictEqual([
      "https://api.commandcode.ai/alpha/whoami?limits=1",
      "https://api.commandcode.ai/alpha/billing/credits",
      "https://api.commandcode.ai/alpha/usage/summary",
    ]);
  });

  test("scopes requests to an organization nested under data", async () => {
    const fetchMock = installResponses([
      Response.json({ data: { organization: { id: "org_nested" } } }),
      credits(),
      Response.json({ totalCost: 5 }),
    ]);

    await fetchCommandCodeUsage(undefined, { apiKey: "cc-token" }, 1000);

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toStrictEqual([
      "https://api.commandcode.ai/alpha/whoami?limits=1",
      "https://api.commandcode.ai/alpha/billing/credits?orgId=org_nested",
      "https://api.commandcode.ai/alpha/usage/summary?orgId=org_nested",
    ]);
  });

  test.each([
    ["null", null],
    ["empty", {}],
    ["missing user", { success: true }],
    ["missing user id", { user: {} }],
    ["invalid organization", { org: { id: 42 }, user: { id: "user" } }],
  ])(
    "rejects %s whoami payloads before billing requests",
    async (_label, body) => {
      const fetchMock = installResponses([Response.json(body)]);

      await expect(
        fetchCommandCodeUsage(undefined, { commandcode: { key: "key" } }, 1000)
      ).rejects.toThrow("invalid Command Code usage");
      expect(fetchMock).toHaveBeenCalledOnce();
    }
  );

  test("fails when nested whoami reports an unsuccessful response", async () => {
    const fetchMock = installResponses([
      Response.json({ data: { success: false } }),
    ]);

    await expect(
      fetchCommandCodeUsage(undefined, { commandcode: { apiKey: "key" } }, 1000)
    ).rejects.toThrow("invalid Command Code usage");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test("keeps monthly quota unknown when its summary request fails", async () => {
    installResponses([
      whoami(),
      credits(),
      new Response(null, { status: 500 }),
    ]);

    const usage = await fetchCommandCodeUsage(
      undefined,
      { commandcode: { key: "cc-token" } },
      1000
    );

    expect(usage.windows.at(-1)).toMatchObject({
      kind: "monthly",
      quota: { _tag: "Unknown" },
    });
  });

  test("keeps monthly quota unknown when summary usage is malformed", async () => {
    installResponses([
      whoami(),
      credits(),
      Response.json({ totalCredits: "bad" }),
    ]);

    const usage = await fetchCommandCodeUsage(
      undefined,
      { commandcode: { key: "cc-token" } },
      1000
    );

    expect(usage.windows.at(-1)).toMatchObject({
      kind: "monthly",
      quota: { _tag: "Unknown" },
    });
  });

  test.each([
    ["missing credits", null],
    [
      "invalid credit balances",
      { freeCredits: 0, monthlyCredits: "bad", purchasedCredits: 0 },
    ],
    [
      "empty credit pool",
      { freeCredits: 0, monthlyCredits: 0, purchasedCredits: 0 },
    ],
  ])("omits monthly usage with %s", async (_label, accountCredits) => {
    installResponses([
      whoami(),
      creditsWith(defaultWindowLimits, accountCredits),
      Response.json({ totalCredits: 0 }),
    ]);

    const usage = await fetchCommandCodeUsage(
      undefined,
      { commandcode: { key: "cc-token" } },
      1000
    );

    expect(usage.windows).toHaveLength(2);
  });

  test("omits unusable credit buckets but keeps valid windows", async () => {
    installResponses([
      whoami(),
      creditsWith(
        {
          fiveHour: { cap: 0, used: 1 },
          weekly: { cap: 35, used: 7 },
        },
        defaultCredits
      ),
      Response.json({ totalCredits: 5 }),
    ]);

    const usage = await fetchCommandCodeUsage(
      undefined,
      { commandcode: { key: "cc-token" } },
      1000
    );

    expect(usage.windows.map((window) => window.kind)).toStrictEqual([
      "weekly",
      "monthly",
    ]);
  });

  test("rejects malformed billing responses and empty window sets", async () => {
    installResponses([whoami(), Response.json({ credits: {} })]);
    await expect(
      fetchCommandCodeUsage(
        undefined,
        { commandcode: { key: "cc-token" } },
        1000
      )
    ).rejects.toThrow("invalid Command Code usage");

    installResponses([
      whoami(),
      creditsWith({ fiveHour: null, weekly: null }, null),
      Response.json({ totalCredits: 5 }),
    ]);
    await expect(
      fetchCommandCodeUsage(
        undefined,
        { commandcode: { key: "cc-token" } },
        1000
      )
    ).rejects.toThrow("invalid Command Code usage");
  });

  test("does not issue unscoped requests when whoami fails", async () => {
    const fetchMock = installResponses([new Response(null, { status: 500 })]);

    await expect(
      fetchCommandCodeUsage(
        undefined,
        { commandcode: { key: "cc-token" } },
        1000
      )
    ).rejects.toThrow("HTTP 500");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test("supports explicit keys with custom base URL paths and queries", async () => {
    const fetchMock = installResponses([
      whoami(),
      credits(),
      Response.json({ totalCredits: 5 }),
    ]);

    await fetchCommandCodeUsage(
      {
        apiKey: "configured-token",
        baseUrl:
          "https://cc.example.test/proxy?orgId=untrusted&tenant=workspace#section",
      },
      { commandcode: { key: "must-not-leak" } },
      1000
    );

    expect(fetchMock.mock.calls.map(([url]) => String(url))).toStrictEqual([
      "https://cc.example.test/proxy/alpha/whoami?tenant=workspace&limits=1",
      "https://cc.example.test/proxy/alpha/billing/credits?tenant=workspace",
      "https://cc.example.test/proxy/alpha/usage/summary?tenant=workspace",
    ]);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer configured-token" },
    });
  });

  test("rejects missing credentials and explicit whoami failure bodies", async () => {
    await expect(fetchCommandCodeUsage(undefined, {}, 1000)).rejects.toThrow(
      "missing Command Code key"
    );
    await expect(fetchCommandCodeUsage(undefined, null, 1000)).rejects.toThrow(
      "missing Command Code key"
    );

    const fetchMock = installResponses([
      Response.json({ message: "unauthenticated", success: false }),
    ]);
    await expect(
      fetchCommandCodeUsage(
        undefined,
        { commandcode: { key: "cc-token" } },
        1000
      )
    ).rejects.toThrow("invalid Command Code usage");
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
