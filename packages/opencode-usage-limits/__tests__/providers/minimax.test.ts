import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { fetchMiniMaxTokenPlanUsage } from "@/providers/minimax.ts";
import type { OpenCodeAuth } from "@/types.ts";

import { installFetchMock, resetFetchMock } from "./helpers.ts";

const missingAuthCases = [
  ["minimax", { minimax: null }],
  ["minimax-coding-plan", { "minimax-coding-plan": null }],
  ["minimax-token-plan", { "minimax-token-plan": null }],
] satisfies readonly (readonly [string, OpenCodeAuth])[];

const successEnvelope = <T>(modelRemains: T) => ({
  base_resp: { status_code: 0, status_msg: "success" },
  model_remains: modelRemains,
});

describe("MiniMax provider", () => {
  afterEach(resetFetchMock);

  const fiveHourRemains = 90 * 60 * 1000;
  const weeklyRemains = 3 * 24 * 60 * 60 * 1000;

  test.each([
    ["valid", JSON.stringify({ minimax: { key: "file-key" } }), "file-key"],
    ["root key", JSON.stringify({ key: "file-key" }), "file-key"],
    ["root apiKey", JSON.stringify({ apiKey: "file-key" }), "file-key"],
    ["non-object", "null", "auth-key"],
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
        await writeFile(authPath, contents);
      }
      try {
        const fetchMock = installFetchMock(
          Response.json(
            successEnvelope([
              {
                current_interval_remaining_percent: 80,
                model_name: "general",
              },
            ])
          )
        );

        await fetchMiniMaxTokenPlanUsage(
          { authPath },
          { minimax: { key: "auth-key" } },
          1000
        );

        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
          headers: { Authorization: `Bearer ${expectedKey}` },
        });
      } finally {
        await rm(authPath, { force: true });
      }
    }
  );

  test("parses the general entry and reports both 5h and weekly windows", async () => {
    const fetchMock = installFetchMock(
      Response.json(
        successEnvelope([
          {
            current_interval_remaining_percent: 99,
            current_weekly_remaining_percent: 99,
            model_name: "video",
            remains_time: fiveHourRemains,
            weekly_remains_time: weeklyRemains,
          },
          {
            current_interval_remaining_percent: 60,
            current_interval_status: 1,
            current_weekly_remaining_percent: 40,
            current_weekly_status: 1,
            model_name: "general",
            remains_time: fiveHourRemains,
            weekly_remains_time: weeklyRemains,
          },
        ])
      )
    );

    const usage = await fetchMiniMaxTokenPlanUsage(
      { apiKey: "mm-key", label: "MiniMax CN" },
      {},
      1000
    );

    const [request] = fetchMock.mock.calls;
    const resetTimes = usage.windows.map((window) =>
      window.resetsAt?.getTime()
    );
    expect({
      init: request?.[1],
      url: request?.[0],
      usage: {
        id: usage.id,
        label: usage.label,
        windows: usage.windows.map((window) => ({
          label: window.label,
          quota: window.quota,
        })),
      },
    }).toMatchObject({
      init: {
        headers: {
          Accept: "application/json",
          Authorization: "Bearer mm-key",
          "Content-Type": "application/json",
        },
        method: "GET",
      },
      url: "https://www.minimax.io/v1/token_plan/remains",
      usage: {
        id: "minimax",
        label: "MiniMax CN",
        windows: [
          {
            label: "5h",
            quota: { remainingPercent: 60, usedPercent: 40 },
          },
          {
            label: "weekly",
            quota: { remainingPercent: 40, usedPercent: 60 },
          },
        ],
      },
    });
    expect(resetTimes).toHaveLength(2);
    expect(resetTimes[0]).toBeGreaterThan(Date.now() + fiveHourRemains - 5000);
    expect(resetTimes[1]).toBeGreaterThan(Date.now() + weeklyRemains - 5000);
  });

  test("honours a baseUrl override for the China region", async () => {
    const fetchMock = installFetchMock(
      Response.json(
        successEnvelope([
          {
            current_interval_remaining_percent: 80,
            current_weekly_remaining_percent: 80,
            model_name: "general",
            remains_time: fiveHourRemains,
            weekly_remains_time: weeklyRemains,
          },
        ])
      )
    );

    await fetchMiniMaxTokenPlanUsage(
      { apiKey: "mm-key", baseUrl: "https://api.minimaxi.com" },
      {},
      1000
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.minimaxi.com/v1/token_plan/remains"
    );
  });

  test("looks up the subscription key under both minimax and minimax-token-plan keys", async () => {
    const fetchMock = installFetchMock(
      Response.json(
        successEnvelope([
          {
            current_interval_remaining_percent: 80,
            model_name: "general",
            remains_time: fiveHourRemains,
          },
        ])
      )
    );

    await fetchMiniMaxTokenPlanUsage(
      undefined,
      { "minimax-token-plan": { key: "alias-mm-key" } },
      1000
    );

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer alias-mm-key" },
    });
  });

  test("accepts the minimax-coding-plan provider id in OpenCode auth", async () => {
    const fetchMock = installFetchMock(
      Response.json(
        successEnvelope([
          {
            current_interval_remaining_percent: 80,
            model_name: "general",
            remains_time: fiveHourRemains,
          },
        ])
      )
    );

    const usage = await fetchMiniMaxTokenPlanUsage(
      {},
      { "minimax-coding-plan": { key: "auth-mm-key" } },
      1000
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://www.minimax.io/v1/token_plan/remains"
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer auth-mm-key" },
    });
    expect(usage).toMatchObject({ id: "minimax" });
  });

  test.each([
    ["direct key", { key: "direct-key" }, "direct-key"],
    ["direct apiKey", { apiKey: "direct-api-key" }, "direct-api-key"],
    ["minimax", { minimax: { apiKey: "nested-api-key" } }, "nested-api-key"],
    [
      "minimax-coding-plan",
      { "minimax-coding-plan": { apiKey: "nested-api-key" } },
      "nested-api-key",
    ],
    [
      "minimax-token-plan",
      { "minimax-token-plan": { apiKey: "nested-api-key" } },
      "nested-api-key",
    ],
  ] as const)("accepts %s OpenCode auth", async (_name, auth, expectedKey) => {
    const fetchMock = installFetchMock(
      Response.json(
        successEnvelope([
          { current_interval_remaining_percent: 80, model_name: "general" },
        ])
      )
    );

    await fetchMiniMaxTokenPlanUsage(undefined, auth, 1000);

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: `Bearer ${expectedKey}` },
    });
  });

  test.each(missingAuthCases)(
    "rejects missing %s auth layouts",
    async (_name, openCodeAuth) => {
      await expect(
        fetchMiniMaxTokenPlanUsage(undefined, openCodeAuth, 1000)
      ).rejects.toThrow("missing MiniMax key");
    }
  );

  test("handles present MiniMax auth namespaces without credentials", async () => {
    await Promise.all([
      expect(
        fetchMiniMaxTokenPlanUsage(undefined, { minimax: {} }, 1000)
      ).rejects.toThrow("missing MiniMax key"),
      expect(
        fetchMiniMaxTokenPlanUsage(
          undefined,
          { "minimax-coding-plan": {} },
          1000
        )
      ).rejects.toThrow("missing MiniMax key"),
      expect(
        fetchMiniMaxTokenPlanUsage(
          undefined,
          { "minimax-token-plan": {} },
          1000
        )
      ).rejects.toThrow("missing MiniMax key"),
    ]);
  });

  test("prefers openCodeAuth over the configured apiKey", async () => {
    const fetchMock = installFetchMock(
      Response.json(
        successEnvelope([
          {
            current_interval_remaining_percent: 90,
            model_name: "general",
            remains_time: fiveHourRemains,
          },
        ])
      )
    );

    await fetchMiniMaxTokenPlanUsage(
      { apiKey: "config-mm-key" },
      { minimax: { apiKey: "auth-mm-key" } },
      1000
    );

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer auth-mm-key" },
    });
  });

  test("resolves environment references when no other credential is available", async () => {
    process.env.OC_USAGE_LIMITS_MINIMAX_KEY = "env-mm-key";
    const fetchMock = installFetchMock(
      Response.json(
        successEnvelope([
          {
            current_interval_remaining_percent: 90,
            model_name: "general",
            remains_time: fiveHourRemains,
          },
        ])
      )
    );

    await fetchMiniMaxTokenPlanUsage(
      { apiKey: "{env:OC_USAGE_LIMITS_MINIMAX_KEY}" },
      {},
      1000
    );

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer env-mm-key" },
    });
  });

  test("emits only the window whose remaining percent is reported", async () => {
    installFetchMock(
      Response.json(
        successEnvelope([
          {
            current_interval_remaining_percent: 50,
            current_interval_status: 1,
            model_name: "general",
            remains_time: fiveHourRemains,
          },
        ])
      )
    );

    const usage = await fetchMiniMaxTokenPlanUsage(
      { apiKey: "mm-key" },
      {},
      1000
    );

    expect(usage.windows).toHaveLength(1);
    expect(usage.windows[0]).toMatchObject({
      label: "5h",
      quota: { remainingPercent: 50, usedPercent: 50 },
    });
  });

  test("falls back to the first in-plan entry when no general entry exists", async () => {
    installFetchMock(
      Response.json(
        successEnvelope([
          {
            current_interval_remaining_percent: 70,
            current_interval_status: 1,
            current_weekly_remaining_percent: 80,
            model_name: "video",
            remains_time: fiveHourRemains,
            weekly_remains_time: weeklyRemains,
          },
          {
            model_name: "image",
          },
        ])
      )
    );

    const usage = await fetchMiniMaxTokenPlanUsage(
      { apiKey: "mm-key" },
      {},
      1000
    );

    expect(usage.windows).toHaveLength(2);
    expect(usage.windows[0]).toMatchObject({
      label: "5h",
      quota: { remainingPercent: 70, usedPercent: 30 },
    });
    expect(usage.windows[1]).toMatchObject({
      label: "weekly",
      quota: { remainingPercent: 80, usedPercent: 20 },
    });
  });

  test("rejects missing keys and malformed responses", async () => {
    await expect(
      fetchMiniMaxTokenPlanUsage(undefined, {}, 1000)
    ).rejects.toThrow("missing MiniMax key");

    installFetchMock(Response.json({}));
    await expect(
      fetchMiniMaxTokenPlanUsage({ apiKey: "mm-key" }, {}, 1000)
    ).rejects.toThrow("invalid MiniMax usage");

    installFetchMock(
      Response.json(
        successEnvelope([{ current_interval_status: 3, model_name: "general" }])
      )
    );
    await expect(
      fetchMiniMaxTokenPlanUsage({ apiKey: "mm-key" }, {}, 1000)
    ).rejects.toThrow("invalid MiniMax usage");

    installFetchMock(
      Response.json({
        base_resp: { status_code: 0, status_msg: "success" },
        model_remains: "not an array",
      })
    );
    await expect(
      fetchMiniMaxTokenPlanUsage({ apiKey: "mm-key" }, {}, 1000)
    ).rejects.toThrow("invalid MiniMax usage");
  });

  test("rejects payloads that are not wrapped in the model_remains envelope", async () => {
    installFetchMock(
      Response.json([
        {
          current_interval_remaining_percent: 80,
          model_name: "general",
          remains_time: fiveHourRemains,
        },
      ])
    );
    await expect(
      fetchMiniMaxTokenPlanUsage({ apiKey: "mm-key" }, {}, 1000)
    ).rejects.toThrow("invalid MiniMax usage");
  });

  test("ignores null model entries before selecting a usable entry", async () => {
    installFetchMock(
      Response.json(
        successEnvelope([
          null,
          {
            current_interval_remaining_percent: 80,
            model_name: "general",
          },
        ])
      )
    );

    const usage = await fetchMiniMaxTokenPlanUsage(
      { apiKey: "mm-key" },
      {},
      1000
    );

    expect(usage.windows[0]).toMatchObject({
      label: "5h",
      quota: { remainingPercent: 80, usedPercent: 20 },
    });
  });

  test.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid remaining percentage %s",
    async (remainingPercent) => {
      installFetchMock(
        Response.json(
          successEnvelope([
            {
              current_interval_remaining_percent: remainingPercent,
              model_name: "general",
            },
          ])
        )
      );

      await expect(
        fetchMiniMaxTokenPlanUsage({ apiKey: "mm-key" }, {}, 1000)
      ).rejects.toThrow("invalid MiniMax usage");
    }
  );

  test("rejects envelopes whose base_resp status_code is non-zero", async () => {
    installFetchMock(
      Response.json({
        base_resp: { status_code: 1, status_msg: "some error" },
        model_remains: [
          {
            current_interval_remaining_percent: 50,
            current_interval_status: 1,
            model_name: "general",
            remains_time: fiveHourRemains,
          },
        ],
      })
    );
    await expect(
      fetchMiniMaxTokenPlanUsage({ apiKey: "mm-key" }, {}, 1000)
    ).rejects.toThrow("invalid MiniMax usage");
  });

  test.each([null, undefined])(
    "accepts successful base_resp with status code %s",
    async (statusCode) => {
      installFetchMock(
        Response.json({
          base_resp: { status_code: statusCode, status_msg: "success" },
          model_remains: [
            { current_interval_remaining_percent: 80, model_name: "general" },
          ],
        })
      );

      await expect(
        fetchMiniMaxTokenPlanUsage({ apiKey: "mm-key" }, {}, 1000)
      ).resolves.toMatchObject({ id: "minimax" });
    }
  );

  test("rejects model fields whose response types are invalid", async () => {
    installFetchMock(
      Response.json(
        successEnvelope([
          {
            current_interval_remaining_percent: "80",
            current_interval_status: "1",
            current_weekly_remaining_percent: "70",
            current_weekly_status: "1",
            model_name: 42,
            remains_time: "1000",
            weekly_remains_time: "2000",
          },
        ])
      )
    );

    await expect(
      fetchMiniMaxTokenPlanUsage({ apiKey: "mm-key" }, {}, 1000)
    ).rejects.toThrow("invalid MiniMax usage");
  });

  test("rejects a successful envelope without selectable model entries", async () => {
    installFetchMock(Response.json(successEnvelope([])));

    await expect(
      fetchMiniMaxTokenPlanUsage({ apiKey: "mm-key" }, {}, 1000)
    ).rejects.toThrow("invalid MiniMax usage");
  });

  test("rejects a malformed base response status message", async () => {
    installFetchMock(
      Response.json({
        base_resp: { status_code: 0, status_msg: 42 },
        model_remains: [
          { current_interval_remaining_percent: 80, model_name: "general" },
        ],
      })
    );

    await expect(
      fetchMiniMaxTokenPlanUsage({ apiKey: "mm-key" }, {}, 1000)
    ).rejects.toThrow("invalid MiniMax usage");
  });

  test("rejects a response without a base response envelope", async () => {
    installFetchMock(
      Response.json({
        model_remains: [
          { current_interval_remaining_percent: 80, model_name: "general" },
        ],
      })
    );

    await expect(
      fetchMiniMaxTokenPlanUsage({ apiKey: "mm-key" }, {}, 1000)
    ).rejects.toThrow("invalid MiniMax usage");
  });

  test("accepts a weekly quota without a reported reset countdown", async () => {
    installFetchMock(
      Response.json(
        successEnvelope([
          {
            current_interval_remaining_percent: 80,
            current_weekly_remaining_percent: 60,
            model_name: "general",
          },
        ])
      )
    );

    const usage = await fetchMiniMaxTokenPlanUsage(
      { apiKey: "mm-key" },
      {},
      1000
    );

    expect(usage.windows[1]?.resetsAt).toBeNull();
  });

  test("hides the weekly window when the model is not in the weekly plan", async () => {
    installFetchMock(
      Response.json(
        successEnvelope([
          {
            current_interval_remaining_percent: 91,
            current_interval_status: 1,
            current_weekly_remaining_percent: 100,
            current_weekly_status: 3,
            model_name: "general",
            remains_time: fiveHourRemains,
            weekly_remains_time: weeklyRemains,
          },
        ])
      )
    );

    const usage = await fetchMiniMaxTokenPlanUsage(
      { apiKey: "mm-key" },
      {},
      1000
    );

    expect(usage.windows).toHaveLength(1);
    expect(usage.windows[0]).toMatchObject({
      label: "5h",
      quota: { remainingPercent: 91, usedPercent: 9 },
    });
  });

  describe("plan variants", () => {
    test("general entry with both 5h and weekly", async () => {
      installFetchMock(
        Response.json(
          successEnvelope([
            {
              current_interval_remaining_percent: 60,
              current_interval_status: 1,
              current_weekly_remaining_percent: 40,
              current_weekly_status: 1,
              model_name: "general",
              remains_time: fiveHourRemains,
              weekly_remains_time: weeklyRemains,
            },
          ])
        )
      );

      const usage = await fetchMiniMaxTokenPlanUsage(
        { apiKey: "mm-key" },
        {},
        1000
      );

      expect(usage.windows).toHaveLength(2);
      expect(usage.windows[0]).toMatchObject({
        label: "5h",
        quota: { remainingPercent: 60, usedPercent: 40 },
      });
      expect(usage.windows[1]).toMatchObject({
        label: "weekly",
        quota: { remainingPercent: 40, usedPercent: 60 },
      });
    });

    test("general entry with only 5h (no weekly plan)", async () => {
      installFetchMock(
        Response.json(
          successEnvelope([
            {
              current_interval_remaining_percent: 75,
              current_interval_status: 1,
              current_weekly_remaining_percent: 100,
              current_weekly_status: 3,
              model_name: "general",
              remains_time: fiveHourRemains,
              weekly_remains_time: weeklyRemains,
            },
          ])
        )
      );

      const usage = await fetchMiniMaxTokenPlanUsage(
        { apiKey: "mm-key" },
        {},
        1000
      );

      expect(usage.windows).toHaveLength(1);
      expect(usage.windows[0]).toMatchObject({
        label: "5h",
        quota: { remainingPercent: 75, usedPercent: 25 },
      });
    });

    test("5h window hidden (current_interval_status === 3)", async () => {
      installFetchMock(
        Response.json(
          successEnvelope([
            {
              current_interval_remaining_percent: 100,
              current_interval_status: 3,
              current_weekly_remaining_percent: 80,
              current_weekly_status: 1,
              model_name: "general",
              remains_time: fiveHourRemains,
              weekly_remains_time: weeklyRemains,
            },
          ])
        )
      );

      await expect(
        fetchMiniMaxTokenPlanUsage({ apiKey: "mm-key" }, {}, 1000)
      ).rejects.toThrow("invalid MiniMax usage");
    });

    test("non-general entry fallback", async () => {
      installFetchMock(
        Response.json(
          successEnvelope([
            {
              current_interval_remaining_percent: 70,
              current_interval_status: 1,
              current_weekly_remaining_percent: 80,
              current_weekly_status: 1,
              model_name: "video",
              remains_time: fiveHourRemains,
              weekly_remains_time: weeklyRemains,
            },
            {
              model_name: "image",
            },
          ])
        )
      );

      const usage = await fetchMiniMaxTokenPlanUsage(
        { apiKey: "mm-key" },
        {},
        1000
      );

      expect(usage.windows).toHaveLength(2);
      expect(usage.windows[0]).toMatchObject({
        label: "5h",
        quota: { remainingPercent: 70, usedPercent: 30 },
      });
      expect(usage.windows[1]).toMatchObject({
        label: "weekly",
        quota: { remainingPercent: 80, usedPercent: 20 },
      });
    });
  });
});
