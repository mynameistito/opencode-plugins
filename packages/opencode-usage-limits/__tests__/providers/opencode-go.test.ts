import { describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { fetchOpenCodeGoUsage } from "@/providers/opencode-go.ts";

import { installFetchMock } from "./helpers.ts";

describe("OpenCode GO provider", () => {
  test.each([
    [
      "valid",
      JSON.stringify({ "opencode-go": { key: "file-key" } }),
      "file-key",
    ],
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
          Response.json({ usage: { rolling: { percent: 1 } } })
        );

        await fetchOpenCodeGoUsage(
          { authPath },
          { "opencode-go": { key: "auth-key" } },
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

  test("builds authenticated requests and parses usage windows", async () => {
    const fetchMock = installFetchMock(
      Response.json({
        usage: {
          monthly: { percent: 35, resetsAt: "2026-09-01T00:00:00.000Z" },
          rolling: { percent: 12, resetsAt: "2026-08-23T00:00:00.000Z" },
          weekly: { percent: 8, resetsAt: "2026-08-30T00:00:00.000Z" },
        },
      })
    );

    const usage = await fetchOpenCodeGoUsage(
      undefined,
      { "opencode-go": { key: "go-token" } },
      1000
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://opencode.ai/zen/go/v1/usage"
    );
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer go-token" },
      method: "GET",
    });
    expect(usage).toMatchObject({ id: "opencode-go", label: "OpenCode GO" });
    expect(usage.windows).toMatchObject([
      { kind: "rolling", quota: { usedPercent: 12 } },
      { kind: "weekly", quota: { usedPercent: 8 } },
      { kind: "monthly", quota: { usedPercent: 35 } },
    ]);
  });

  test("supports the OPENCODE_API_KEY environment reference", async () => {
    const fetchMock = installFetchMock(
      Response.json({ usage: { rolling: { percent: 1 } } })
    );
    const previous = process.env.OPENCODE_API_KEY;
    process.env.OPENCODE_API_KEY = "env-token";

    try {
      await fetchOpenCodeGoUsage(
        { apiKey: "{env:OPENCODE_API_KEY}" },
        {},
        1000
      );
    } finally {
      if (previous === undefined) {
        delete process.env.OPENCODE_API_KEY;
      } else {
        process.env.OPENCODE_API_KEY = previous;
      }
    }

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer env-token" },
    });
  });

  test("uses nested OpenCode auth credentials", async () => {
    const fetchMock = installFetchMock(
      Response.json({ usage: { rolling: { percent: 1 } } })
    );

    await fetchOpenCodeGoUsage(
      undefined,
      { opencode: { apiKey: "key" } },
      1000
    );

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: { Authorization: "Bearer key" },
    });
  });

  test("rejects missing credentials", async () => {
    await expect(fetchOpenCodeGoUsage(undefined, {}, 1000)).rejects.toThrow(
      "missing OpenCode GO key"
    );
  });

  test("rejects malformed usage responses", async () => {
    installFetchMock(Response.json({ usage: { rolling: { percent: 101 } } }));

    await expect(
      fetchOpenCodeGoUsage(undefined, { opencode: { key: "key" } }, 1000)
    ).rejects.toThrow("invalid OpenCode GO usage");
  });

  test.each([Response.json([]), Response.json({})])(
    "rejects malformed usage payloads",
    async (response) => {
      installFetchMock(response);

      await expect(
        fetchOpenCodeGoUsage(undefined, { opencode: { key: "key" } }, 1000)
      ).rejects.toThrow("invalid OpenCode GO usage");
    }
  );
});
