import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseOpenCodeAuth } from "@/config-schema.ts";
import {
  ProviderResponseDecodeError,
  ProviderTransportError,
} from "@/errors.ts";
import { pluginProviderForOpenCode } from "@/providers/index.ts";
import { fetchOpenRouterUsage } from "@/providers/openrouter.ts";

import { installFetchMock, resetFetchMock } from "./helpers.ts";

interface KeyResponseData {
  readonly byok_usage?: number;
  readonly include_byok_in_limit?: boolean;
  readonly limit?: number | string | null;
  readonly limit_remaining?: number | string | null;
  readonly limit_reset?: string | null;
  readonly rate_limit?: {
    readonly interval: string;
    readonly requests: number;
  };
  readonly usage?: number;
}

const keyResponse = (data: KeyResponseData) => Response.json({ data });

describe("OpenRouter provider", () => {
  afterEach(resetFetchMock);

  it.each([
    ["daily", "daily"],
    ["weekly", "weekly"],
    ["monthly", "monthly"],
    [null, "credits"],
    [undefined, "credits"],
    ["unspecified", "credits"],
  ] as const)(
    "maps reset cadence %s without inventing a reset",
    async (cadence, kind) => {
      const fetchMock = installFetchMock(
        keyResponse({ limit: 100, limit_remaining: 74.5, limit_reset: cadence })
      );

      const usage = await fetchOpenRouterUsage(
        undefined,
        { openrouter: { key: "key" } },
        1000
      );

      expect(fetchMock.mock.calls[0]).toMatchObject([
        "https://openrouter.ai/api/v1/key",
        {
          headers: { Accept: "application/json", Authorization: "Bearer key" },
          method: "GET",
        },
      ]);
      expect(usage.windows).toStrictEqual([
        {
          kind,
          label: "spend",
          quota: {
            _tag: "Count",
            current: 25.5,
            remainingPercent: 74.5,
            total: 100,
            unit: "USD",
            usedPercent: 25.5,
          },
          resetsAt: null,
        },
      ]);
    }
  );

  it.each([false, true])(
    "does not double-count BYOK usage when include_byok_in_limit is %s",
    async (includeByok) => {
      const fetchMock = installFetchMock(
        keyResponse({
          byok_usage: 17.38,
          include_byok_in_limit: includeByok,
          limit: 100,
          limit_remaining: 74.5,
          limit_reset: "monthly",
          rate_limit: { interval: "1h", requests: 1000 },
          usage: 25.5,
        })
      );
      const auth = parseOpenCodeAuth({ openrouter: { key: "key" } });

      const usage = await fetchOpenRouterUsage(undefined, auth, 1000);

      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        headers: { Authorization: "Bearer key" },
      });
      expect(usage.windows[0]?.quota).toMatchObject({
        current: 25.5,
        total: 100,
      });
    }
  );

  it("supports zero and fully consumed spending limits", async () => {
    installFetchMock(keyResponse({ limit: 100, limit_remaining: 100 }));
    const unused = await fetchOpenRouterUsage({ apiKey: "explicit" }, {}, 1000);
    expect(unused.windows[0]?.quota).toMatchObject({
      current: 0,
      usedPercent: 0,
    });

    installFetchMock(keyResponse({ limit: 100, limit_remaining: 0 }));
    const spent = await fetchOpenRouterUsage({ apiKey: "explicit" }, {}, 1000);
    expect(spent.windows[0]?.quota).toMatchObject({
      current: 100,
      usedPercent: 100,
    });
  });

  it("clamps a remaining amount larger than the limit", async () => {
    installFetchMock(keyResponse({ limit: 100, limit_remaining: 120 }));

    const usage = await fetchOpenRouterUsage({ apiKey: "explicit" }, {}, 1000);

    expect(usage.windows[0]?.quota).toMatchObject({
      current: 0,
      remainingPercent: 100,
      usedPercent: 0,
    });
  });

  it.each([
    ["null limit", { limit: null, limit_remaining: null }],
    ["missing limit", { limit_remaining: 10 }],
    ["zero limit", { limit: 0, limit_remaining: 0 }],
    ["null remaining", { limit: 100, limit_remaining: null }],
  ])("does not invent a quota for %s", async (_label, data) => {
    installFetchMock(keyResponse(data));

    const usage = await fetchOpenRouterUsage({ apiKey: "explicit" }, {}, 1000);

    expect(usage.windows[0]).toMatchObject({
      kind: "credits",
      label: "spend limit",
      quota: { _tag: "Unknown" },
      resetsAt: null,
    });
  });

  it.each([
    ["string limit", { limit: "100", limit_remaining: 50 }],
    ["negative limit", { limit: -1, limit_remaining: 0 }],
    ["negative remaining", { limit: 100, limit_remaining: -1 }],
    ["string remaining", { limit: 100, limit_remaining: "50" }],
  ])("rejects malformed %s", async (_label, data) => {
    installFetchMock(keyResponse(data));

    await expect(
      fetchOpenRouterUsage({ apiKey: "explicit" }, {}, 1000)
    ).rejects.toBeInstanceOf(ProviderResponseDecodeError);
  });

  it("uses explicit environment-backed credentials", async () => {
    process.env.OPENROUTER_API_KEY = "environment-key";
    const fetchMock = installFetchMock(
      keyResponse({ limit: 100, limit_remaining: 74.5, limit_reset: "monthly" })
    );

    await fetchOpenRouterUsage(
      { apiKey: "{env:OPENROUTER_API_KEY}" },
      {},
      1000
    );

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer environment-key" },
    });
  });

  it("prefers authPath to OpenCode and configured credentials", async () => {
    const authPath = path.join(
      tmpdir(),
      `oc-usage-limits-openrouter-${crypto.randomUUID()}.json`
    );
    await writeFile(
      authPath,
      JSON.stringify({ openrouter: { key: "file-key" } })
    );
    try {
      const fetchMock = installFetchMock(
        keyResponse({
          limit: 100,
          limit_remaining: 74.5,
          limit_reset: "monthly",
        })
      );

      await fetchOpenRouterUsage(
        { apiKey: "config-key", authPath },
        { openrouter: { key: "opencode-key" } },
        1000
      );

      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        headers: { Authorization: "Bearer file-key" },
      });
    } finally {
      await rm(authPath, { force: true });
    }
  });

  it("requires an explicit credential on custom origins", async () => {
    await expect(
      fetchOpenRouterUsage(
        { baseUrl: "https://router.example.test" },
        { openrouter: { key: "opencode-key" } },
        1000
      )
    ).rejects.toThrow("missing OpenRouter key");

    const fetchMock = installFetchMock(
      keyResponse({ limit: 100, limit_remaining: 74.5, limit_reset: "monthly" })
    );
    await fetchOpenRouterUsage(
      {
        apiKey: "explicit-key",
        baseUrl: "https://router.example.test/v1?tenant=one#fragment",
      },
      { openrouter: { key: "opencode-key" } },
      1000
    );
    expect(fetchMock.mock.calls[0]).toMatchObject([
      "https://router.example.test/api/v1/key",
      { headers: { Authorization: "Bearer explicit-key" } },
    ]);
  });

  it("uses an explicitly configured authPath credential on custom origins", async () => {
    const authPath = path.join(
      tmpdir(),
      `oc-usage-limits-openrouter-custom-${crypto.randomUUID()}.json`
    );
    await writeFile(authPath, JSON.stringify({ key: "auth-file-key" }));
    try {
      const fetchMock = installFetchMock(
        keyResponse({ limit: 100, limit_remaining: 74.5 })
      );

      await fetchOpenRouterUsage(
        { authPath, baseUrl: "https://router.example.test" },
        {},
        1000
      );

      expect(fetchMock.mock.calls[0]).toMatchObject([
        "https://router.example.test/api/v1/key",
        { headers: { Authorization: "Bearer auth-file-key" } },
      ]);
    } finally {
      await rm(authPath, { force: true });
    }
  });

  it("classifies HTTP and malformed-envelope failures", async () => {
    installFetchMock(
      Response.json({ message: "unauthorized" }, { status: 401 })
    );
    const request = fetchOpenRouterUsage({ apiKey: "explicit" }, {}, 1000);
    await expect(request).rejects.toBeInstanceOf(ProviderTransportError);
    await expect(request).rejects.toThrow("provider credentials were rejected");

    installFetchMock(Response.json({ data: [] }));
    await expect(
      fetchOpenRouterUsage({ apiKey: "explicit" }, {}, 1000)
    ).rejects.toBeInstanceOf(ProviderResponseDecodeError);
  });

  it("maps OpenCode sessions to the OpenRouter provider", () => {
    expect(pluginProviderForOpenCode("openrouter")).toBe("openrouter");
  });
});
