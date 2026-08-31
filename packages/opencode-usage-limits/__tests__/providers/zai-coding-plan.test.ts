import { describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { fetchZaiCodingPlanUsage } from "@/providers/zai-coding-plan.ts";
import type { OpenCodeAuth } from "@/types.ts";

import { installFetchMock } from "./helpers.ts";

describe("ZAI provider", () => {
  test.each([
    ["valid", JSON.stringify({ zai: { key: "file-key" } }), "file-key"],
    ["missing", undefined, "auth-key"],
    ["malformed", "{", "auth-key"],
  ])(
    "uses the %s configured auth file or falls back to OpenCode auth",
    async (_kind, contents, expectedKey) => {
      const authPath = path.join(
        tmpdir(),
        `oc-usage-limits-${crypto.randomUUID()}.json`
      );
      if (contents !== undefined) {
        await Bun.write(authPath, contents);
      }
      try {
        const fetchMock = installFetchMock(
          Response.json({
            data: {
              limits: [{ percentage: 50, type: "TOKENS_LIMIT", usage: 50 }],
            },
          })
        );

        await fetchZaiCodingPlanUsage(
          { authPath },
          { zai: { key: "auth-key" } },
          1000
        );

        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
          headers: { Authorization: expectedKey },
        });
      } finally {
        await rm(authPath, { force: true });
      }
    }
  );

  test("prefers auth data, sends bearer tokens when configured, and infers Max tier", async () => {
    const nextResetTime = Date.now() + 90_000;
    const fetchMock = installFetchMock(
      Response.json({
        data: {
          limits: [
            {
              currentValue: 4440,
              nextResetTime,
              percentage: 44.4,
              type: "TOKENS_LIMIT",
            },
            {
              currentValue: 25,
              percentage: 75,
              type: "TIME_LIMIT",
              usage: 1500,
            },
            { type: "UNKNOWN_LIMIT" },
          ],
        },
      })
    );

    const usage = await fetchZaiCodingPlanUsage(
      {
        apiKey: "config-key",
        authorizationScheme: "bearer",
        label: "Zed",
      },
      { zai: { key: "auth-key" } },
      1000
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.z.ai/api/monitor/usage/quota/limit"
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer auth-key" },
      method: "GET",
    });
    expect(usage).toMatchObject({
      id: "zai",
      label: "Zed",
      tierName: "Max",
    });
    expect(usage.windows).toHaveLength(1);
    expect(usage.windows[0]).toMatchObject({
      label: "5h",
      quota: {
        current: 4440,
        remainingPercent: 55.6,
        total: 10_000,
        usedPercent: 44.4,
      },
    });
    expect(usage.windows[0]?.resetsAt?.getTime()).toBeGreaterThan(Date.now());
  });

  test("uses configured environment references when auth does not contain a key", async () => {
    process.env.OC_USAGE_LIMITS_ZAI_KEY = "env-key";
    const fetchMock = installFetchMock(
      Response.json({
        data: {
          limits: [{ percentage: 50, type: "TOKENS_LIMIT", usage: 50 }],
        },
      })
    );

    await fetchZaiCodingPlanUsage(
      { apiKey: "{env:OC_USAGE_LIMITS_ZAI_KEY}" },
      {},
      1000
    );

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "env-key" },
    });
  });

  test.each([
    ["direct apiKey", { apiKey: "direct-key" }],
    ["zai-coding-plan", { "zai-coding-plan": { key: "plan-key" } }],
  ])("accepts %s OpenCode auth", async (_name, auth) => {
    const rawAuth: unknown = structuredClone(auth);
    // SAFETY: The fixture represents untyped JSON loaded from OpenCode auth.
    const openCodeAuth = rawAuth as OpenCodeAuth;
    const fetchMock = installFetchMock(
      Response.json({
        data: {
          limits: [{ percentage: 50, type: "TOKENS_LIMIT", usage: 50 }],
        },
      })
    );

    await fetchZaiCodingPlanUsage(undefined, openCodeAuth, 1000);

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        Authorization: "zai-coding-plan" in auth ? "plan-key" : "direct-key",
      },
    });
  });

  describe("tier inference", () => {
    test.each([
      [1400, "Max"],
      [1500, "Max"],
      [2000, "Max"],
      [9999, "Max"],
    ] as const)(
      "infers %s total prompts as Max tier",
      async (usageTotal, tierName) => {
        installFetchMock(
          Response.json({
            data: {
              limits: [
                { percentage: 50, type: "TOKENS_LIMIT", usage: 50 },
                { percentage: 1, type: "TIME_LIMIT", usage: usageTotal },
              ],
            },
          })
        );

        await expect(
          fetchZaiCodingPlanUsage({ apiKey: "key" }, {}, 1000)
        ).resolves.toMatchObject({ tierName });
      }
    );

    test.each([
      [300, "Pro"],
      [500, "Pro"],
      [1000, "Pro"],
      [1399, "Pro"],
    ] as const)(
      "infers %s total prompts as Pro tier",
      async (usageTotal, tierName) => {
        installFetchMock(
          Response.json({
            data: {
              limits: [
                { percentage: 50, type: "TOKENS_LIMIT", usage: 50 },
                { percentage: 1, type: "TIME_LIMIT", usage: usageTotal },
              ],
            },
          })
        );

        await expect(
          fetchZaiCodingPlanUsage({ apiKey: "key" }, {}, 1000)
        ).resolves.toMatchObject({ tierName });
      }
    );

    test.each([
      [1, "Lite"],
      [50, "Lite"],
      [100, "Lite"],
      [299, "Lite"],
    ] as const)(
      "infers %s total prompts as Lite tier",
      async (usageTotal, tierName) => {
        installFetchMock(
          Response.json({
            data: {
              limits: [
                { percentage: 50, type: "TOKENS_LIMIT", usage: 50 },
                { percentage: 1, type: "TIME_LIMIT", usage: usageTotal },
              ],
            },
          })
        );

        await expect(
          fetchZaiCodingPlanUsage({ apiKey: "key" }, {}, 1000)
        ).resolves.toMatchObject({ tierName });
      }
    );

    test("infers 0 total prompts as Unknown tier", async () => {
      installFetchMock(
        Response.json({
          data: {
            limits: [
              { percentage: 50, type: "TOKENS_LIMIT", usage: 50 },
              { percentage: 0, type: "TIME_LIMIT", usage: 0 },
            ],
          },
        })
      );

      await expect(
        fetchZaiCodingPlanUsage({ apiKey: "key" }, {}, 1000)
      ).resolves.toSatisfy(({ tierName }) => tierName === undefined);
    });

    test("infers missing usage total as Unknown tier", async () => {
      installFetchMock(
        Response.json({
          data: {
            limits: [
              { percentage: 50, type: "TOKENS_LIMIT", usage: 50 },
              { percentage: 1, type: "TIME_LIMIT" },
            ],
          },
        })
      );

      await expect(
        fetchZaiCodingPlanUsage({ apiKey: "key" }, {}, 1000)
      ).resolves.toSatisfy(({ tierName }) => tierName === undefined);
    });
  });

  test("rejects missing keys and malformed responses", async () => {
    await expect(fetchZaiCodingPlanUsage(undefined, {}, 1000)).rejects.toThrow(
      "missing ZAI key"
    );

    installFetchMock(Response.json({ data: {} }));
    await expect(
      fetchZaiCodingPlanUsage({ apiKey: "key" }, {}, 1000)
    ).rejects.toThrow("invalid ZAI usage");
  });

  test("ignores null limits but rejects a payload without a rolling limit", async () => {
    installFetchMock(
      Response.json({
        data: {
          limits: [null, { percentage: 50, type: "TIME_LIMIT", usage: 50 }],
        },
      })
    );

    await expect(
      fetchZaiCodingPlanUsage({ apiKey: "key" }, {}, 1000)
    ).rejects.toThrow("invalid ZAI usage");
  });

  test.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid required token percentage %s",
    async (percentage) => {
      installFetchMock(
        Response.json({
          data: { limits: [{ percentage, type: "TOKENS_LIMIT" }] },
        })
      );

      await expect(
        fetchZaiCodingPlanUsage({ apiKey: "key" }, {}, 1000)
      ).rejects.toThrow("invalid ZAI usage");
    }
  );

  test("downgrades invalid optional counts to percentage usage", async () => {
    installFetchMock(
      Response.json({
        data: {
          limits: [
            {
              currentValue: -10,
              percentage: 25,
              type: "TOKENS_LIMIT",
            },
          ],
        },
      })
    );

    const usage = await fetchZaiCodingPlanUsage({ apiKey: "key" }, {}, 1000);
    expect(usage.windows[0]?.quota._tag).toBe("Percentage");
  });
});
