import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Effect, Exit, Layer } from "effect";
import { afterEach, describe, expect, test } from "vitest";

import { ProviderTransportError } from "@/errors.ts";
import { codexProvider, fetchCodexUsage } from "@/providers/codex.ts";
import { ProviderCommandExecutorLive } from "@/providers/runtime/command.ts";
import { ProviderEnvironmentLive } from "@/providers/runtime/environment.ts";
import { ProviderFileSystem } from "@/providers/runtime/filesystem.ts";
import { ProviderHttpClientLive } from "@/providers/runtime/http.ts";

import { installFetchMock, resetFetchMock } from "./helpers.ts";

describe("Codex provider", () => {
  afterEach(resetFetchMock);

  test("uses credentials from the configured Codex auth file", async () => {
    const authPath = path.join(
      tmpdir(),
      `oc-usage-limits-${crypto.randomUUID()}.json`
    );
    await writeFile(
      authPath,
      JSON.stringify({
        tokens: { access_token: "file-access", account_id: "file-account" },
      })
    );
    try {
      const fetchMock = installFetchMock(
        Response.json({ rate_limit: { primary_window: { used_percent: 0 } } })
      );

      await fetchCodexUsage({ authPath }, {}, 1000);

      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        headers: {
          Authorization: "Bearer file-access",
          "ChatGPT-Account-Id": "file-account",
        },
      });
    } finally {
      await rm(authPath, { force: true });
    }
  });

  test("falls back to Codex auth when OpenCode credentials are rejected", async () => {
    const authPath = path.join(
      tmpdir(),
      `oc-usage-limits-${crypto.randomUUID()}.json`
    );
    await writeFile(
      authPath,
      JSON.stringify({
        tokens: { access_token: "codex-access", account_id: "codex-account" },
      })
    );
    try {
      let attempts = 0;
      const fetchMock = installFetchMock(
        Response.json({ rate_limit: { primary_window: { used_percent: 0 } } })
      );
      fetchMock.mockImplementation(() => {
        attempts += 1;
        return Promise.resolve(
          attempts === 1
            ? new Response(null, { status: 401 })
            : Response.json({
                rate_limit: { primary_window: { used_percent: 13 } },
              })
        );
      });

      const usage = await fetchCodexUsage(
        { authPath },
        { openai: { access: "expired-access", accountId: "openai-account" } },
        1000
      );

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
        headers: {
          Authorization: "Bearer expired-access",
          "ChatGPT-Account-Id": "openai-account",
        },
      });
      expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
        headers: {
          Authorization: "Bearer codex-access",
          "ChatGPT-Account-Id": "codex-account",
        },
      });
      expect(usage.windows[0]?.quota).toMatchObject({ usedPercent: 13 });
    } finally {
      await rm(authPath, { force: true });
    }
  });

  test("preserves a configured API key during the auth fallback", async () => {
    let attempts = 0;
    const fetchMock = installFetchMock(
      Response.json({ rate_limit: { primary_window: { used_percent: 13 } } })
    );
    fetchMock.mockImplementation(() => {
      attempts += 1;
      return Promise.resolve(
        attempts === 1
          ? new Response(null, { status: 401 })
          : Response.json({
              rate_limit: { primary_window: { used_percent: 13 } },
            })
      );
    });

    await fetchCodexUsage(
      { apiKey: "configured-token" },
      { openai: { access: "expired-access", accountId: "openai-account" } },
      1000
    );

    expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
      headers: {
        Authorization: "Bearer configured-token",
        "ChatGPT-Account-Id": "openai-account",
      },
    });
  });

  test("rejects a missing configured Codex auth file", async () => {
    const authPath = path.join(
      tmpdir(),
      `oc-usage-limits-${crypto.randomUUID()}.json`
    );

    await expect(fetchCodexUsage({ authPath }, {}, 1000)).rejects.toThrow(
      "provider request failed"
    );
  });

  test("uses the default Codex auth path when no fallback credential is configured", async () => {
    const paths: string[] = [];
    const files = Layer.succeed(ProviderFileSystem, {
      readJson: (input) =>
        Effect.sync(() => {
          paths.push(input.path);
        }).pipe(
          Effect.flatMap(() =>
            Effect.fail(
              new ProviderTransportError({
                cause: "filesystem",
                operation: "read-auth",
                providerID: input.providerID,
              })
            )
          )
        ),
      readText: (input) =>
        Effect.sync(() => {
          paths.push(input.path);
        }).pipe(
          Effect.flatMap(() =>
            Effect.fail(
              new ProviderTransportError({
                cause: "filesystem",
                operation: "read-auth",
                providerID: input.providerID,
              })
            )
          )
        ),
    });
    const exit = await Effect.runPromiseExit(
      codexProvider
        .fetch(undefined, {}, 1000)
        .pipe(
          Effect.provide(
            Layer.mergeAll(
              files,
              ProviderCommandExecutorLive,
              ProviderEnvironmentLive,
              ProviderHttpClientLive
            )
          )
        )
    );

    expect(Exit.isFailure(exit)).toBeTruthy();
    expect(paths).toContain("~/.codex/auth.json");
  });

  test("rejects auth files without a token object or complete credentials", async () => {
    const authPath = path.join(
      tmpdir(),
      `oc-usage-limits-${crypto.randomUUID()}.json`
    );
    await writeFile(
      authPath,
      JSON.stringify({ tokens: { access_token: "token" } })
    );
    try {
      await expect(fetchCodexUsage({ authPath }, {}, 1000)).rejects.toThrow(
        "missing Codex auth"
      );
    } finally {
      await rm(authPath, { force: true });
    }
  });

  test.each(["null", JSON.stringify({}), JSON.stringify({ tokens: "bad" })])(
    "rejects malformed auth file payload %s",
    async (contents) => {
      const authPath = path.join(
        tmpdir(),
        `oc-usage-limits-${crypto.randomUUID()}.json`
      );
      await writeFile(authPath, contents);
      try {
        await expect(fetchCodexUsage({ authPath }, {}, 1000)).rejects.toThrow(
          "missing Codex auth"
        );
      } finally {
        await rm(authPath, { force: true });
      }
    }
  );

  test("does not retry unauthorized requests for a custom host", async () => {
    const fetchMock = installFetchMock(new Response(null, { status: 401 }));

    await expect(
      fetchCodexUsage(
        { apiKey: "configured-token", baseUrl: "https://codex.example" },
        { openai: { access: "expired-access", accountId: "account" } },
        1000
      )
    ).rejects.toThrow("provider credentials were rejected");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test("ignores optional response fields with invalid types", async () => {
    installFetchMock(
      Response.json({
        plan_type: 42,
        rate_limit: {
          primary_window: {
            limit_window_seconds: "wrong",
            reset_at: "wrong",
            used_percent: 0,
          },
          secondary_window: null,
        },
        rate_limit_reset_credits: { available_count: "wrong" },
      })
    );

    const usage = await fetchCodexUsage(
      { apiKey: "configured-token", baseUrl: "https://codex.example" },
      {},
      1000
    );

    expect(usage).toMatchObject({ metadata: { resetCredits: null } });
    expect(usage.tierName).toBeUndefined();
  });

  test("accepts a window with no optional fields and omits invalid nested windows", async () => {
    installFetchMock(
      Response.json({
        rate_limit: {
          primary_window: {},
          secondary_window: { used_percent: "invalid" },
        },
      })
    );

    const usage = await fetchCodexUsage(
      { apiKey: "configured-token", baseUrl: "https://codex.example" },
      {},
      1000
    );

    expect(usage.windows).toMatchObject([
      { label: "usage", quota: { _tag: "Unknown" } },
    ]);
  });

  test("treats non-object optional Codex windows as absent", async () => {
    installFetchMock(
      Response.json({
        plan_type: 42,
        rate_limit: { primary_window: null, secondary_window: null },
      })
    );

    await expect(
      fetchCodexUsage(
        { apiKey: "configured-token", baseUrl: "https://codex.example" },
        {},
        1000
      )
    ).rejects.toThrow("invalid Codex usage");
  });

  test("rejects invalid primary window percentages", async () => {
    installFetchMock(
      Response.json({ rate_limit: { primary_window: { used_percent: 101 } } })
    );

    await expect(
      fetchCodexUsage(
        { apiKey: "configured-token", baseUrl: "https://codex.example" },
        {},
        1000
      )
    ).rejects.toThrow("invalid Codex usage");
  });

  test("keeps the original unauthorized error when fallback credentials are unavailable", async () => {
    const authPath = path.join(
      tmpdir(),
      `oc-usage-limits-${crypto.randomUUID()}.json`
    );
    const fetchMock = installFetchMock(new Response(null, { status: 401 }));

    await expect(
      fetchCodexUsage(
        { authPath },
        { openai: { access: "expired-access", accountId: "account" } },
        1000
      )
    ).rejects.toThrow("provider credentials were rejected");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test("builds authenticated requests and parses usage windows", async () => {
    const fetchMock = installFetchMock(
      Response.json({
        plan_type: "team",
        rate_limit: {
          primary_window: {
            limit_window_seconds: 18_000,
            reset_after_seconds: 3600,
            reset_at: 1_782_216_000,
            used_percent: 100,
          },
          secondary_window: {
            limit_window_seconds: 86_400,
            reset_after_seconds: 7200,
            used_percent: 0,
          },
        },
        rate_limit_reset_credits: { available_count: 2 },
      })
    );

    const usage = await fetchCodexUsage(
      {
        apiKey: "configured-token",
        baseUrl: "https://codex.example/",
        label: "Codex",
      },
      { openai: { access: "access-token", accountId: "account-id" } },
      1000
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://codex.example/wham/usage"
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        Authorization: "Bearer configured-token",
        "ChatGPT-Account-Id": "configured",
      },
      method: "GET",
    });
    expect(usage).toMatchObject({
      id: "codex",
      label: "Codex",
      metadata: { resetCredits: 2 },
      tierName: "team",
    });
    expect(usage.windows).toMatchObject([
      {
        label: "5h",
        quota: { remainingPercent: 0, usedPercent: 100 },
      },
      {
        label: "daily",
        quota: { remainingPercent: 100, usedPercent: 0 },
      },
    ]);
    expect(usage.windows[0]?.resetsAt?.toISOString()).toBe(
      "2026-06-23T12:00:00.000Z"
    );
  });

  test("rejects malformed Codex responses", async () => {
    installFetchMock(Response.json([]));

    await expect(
      fetchCodexUsage(
        undefined,
        { openai: { access: "access-token", accountId: "account-id" } },
        1000
      )
    ).rejects.toThrow("invalid Codex usage");
  });

  test("does not use discovered OpenCode credentials for a custom host", async () => {
    await expect(
      fetchCodexUsage(
        { baseUrl: "https://codex.example/" },
        { openai: { access: "discovered", accountId: "discovered" } },
        1000
      )
    ).rejects.toThrow("missing Codex auth");
  });

  test.each([
    ["http://localhost:3000/", "http://localhost:3000/wham/usage"],
    ["http://127.0.0.1:4321", "http://127.0.0.1:4321/wham/usage"],
    ["http://[::1]:3000", "http://[::1]:3000/wham/usage"],
    [
      "https://chatgpt.com/backend-api/",
      "https://chatgpt.com/backend-api/wham/usage",
    ],
  ] as const)("allows safe base URL %s", async (baseUrl, expectedUrl) => {
    const fetchMock = installFetchMock(
      Response.json({ rate_limit: { primary_window: { used_percent: 0 } } })
    );

    await fetchCodexUsage(
      { apiKey: "configured-token", baseUrl },
      { openai: { access: "token", accountId: "account" } },
      1000
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(expectedUrl);
  });

  test.each([
    ["http://evil.example", "https://chatgpt.com/backend-api/wham/usage"],
    ["ftp://example.com", "https://chatgpt.com/backend-api/wham/usage"],
    ["not a url", "https://chatgpt.com/backend-api/wham/usage"],
  ] as const)(
    "falls back from unsafe base URL %s",
    async (baseUrl, expectedUrl) => {
      const fetchMock = installFetchMock(
        Response.json({ rate_limit: { primary_window: { used_percent: 0 } } })
      );

      await fetchCodexUsage(
        { baseUrl },
        { openai: { access: "token", accountId: "account" } },
        1000
      );

      expect(fetchMock.mock.calls[0]?.[0]).toBe(expectedUrl);
    }
  );

  describe("window variants", () => {
    test("primary window only", async () => {
      installFetchMock(
        Response.json({
          plan_type: "team",
          rate_limit: {
            primary_window: {
              limit_window_seconds: 18_000,
              reset_after_seconds: 3600,
              reset_at: 1_782_216_000,
              used_percent: 50,
            },
          },
        })
      );

      const usage = await fetchCodexUsage(
        {
          apiKey: "configured-token",
          baseUrl: "https://codex.example/",
          label: "Codex",
        },
        { openai: { access: "access-token", accountId: "account-id" } },
        1000
      );

      expect(usage.windows).toHaveLength(1);
      expect(usage.windows[0]).toMatchObject({
        label: "5h",
        quota: { remainingPercent: 50, usedPercent: 50 },
      });
    });

    test("primary + secondary windows", async () => {
      installFetchMock(
        Response.json({
          plan_type: "team",
          rate_limit: {
            primary_window: {
              limit_window_seconds: 18_000,
              reset_after_seconds: 3600,
              reset_at: 1_782_216_000,
              used_percent: 100,
            },
            secondary_window: {
              limit_window_seconds: 86_400,
              reset_after_seconds: 7200,
              used_percent: 0,
            },
          },
        })
      );

      const usage = await fetchCodexUsage(
        {
          apiKey: "configured-token",
          baseUrl: "https://codex.example/",
          label: "Codex",
        },
        { openai: { access: "access-token", accountId: "account-id" } },
        1000
      );

      expect(usage.windows).toHaveLength(2);
      expect(usage.windows[0]).toMatchObject({
        label: "5h",
        quota: { remainingPercent: 0, usedPercent: 100 },
      });
      expect(usage.windows[1]).toMatchObject({
        label: "daily",
        quota: { remainingPercent: 100, usedPercent: 0 },
      });
    });

    test("reset credits metadata", async () => {
      installFetchMock(
        Response.json({
          plan_type: "team",
          rate_limit: {
            primary_window: {
              limit_window_seconds: 18_000,
              reset_after_seconds: 3600,
              reset_at: 1_782_216_000,
              used_percent: 50,
            },
          },
          rate_limit_reset_credits: { available_count: 5 },
        })
      );

      const usage = await fetchCodexUsage(
        {
          apiKey: "configured-token",
          baseUrl: "https://codex.example/",
          label: "Codex",
        },
        { openai: { access: "access-token", accountId: "account-id" } },
        1000
      );

      expect(usage.metadata).toMatchObject({
        resetCredits: 5,
      });
    });

    test.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
      "rejects invalid required percentage %s",
      async (usedPercent) => {
        installFetchMock(
          Response.json({
            rate_limit: {
              primary_window: {
                limit_window_seconds: 18_000,
                used_percent: usedPercent,
              },
            },
          })
        );

        await expect(
          fetchCodexUsage(
            undefined,
            { openai: { access: "token", accountId: "account" } },
            1000
          )
        ).rejects.toThrow("invalid Codex usage");
      }
    );

    test("plan type", async () => {
      installFetchMock(
        Response.json({
          plan_type: "enterprise",
          rate_limit: {
            primary_window: {
              limit_window_seconds: 18_000,
              reset_after_seconds: 3600,
              reset_at: 1_782_216_000,
              used_percent: 50,
            },
          },
        })
      );

      const usage = await fetchCodexUsage(
        {
          apiKey: "configured-token",
          baseUrl: "https://codex.example/",
          label: "Codex",
        },
        { openai: { access: "access-token", accountId: "account-id" } },
        1000
      );

      expect(usage.tierName).toBe("enterprise");
    });
  });
});
