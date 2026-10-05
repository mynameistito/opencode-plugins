import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";

import {
  fetchProvider,
  fetchProviderEffect,
  getProviderConfigs,
} from "@/providers.ts";
import { codexProvider } from "@/providers/codex.ts";
import type { ProviderDefinition } from "@/providers/definition.ts";
import {
  defaultLabelFor,
  pluginProviderForOpenCode,
  PROVIDER_ORDER,
  PROVIDER_REGISTRY,
  PROVIDERS,
} from "@/providers/index.ts";
import { ProviderRuntimeLive } from "@/providers/runtime/index.ts";
import type { ProviderUsage } from "@/types.ts";

import { installFetchMock, resetFetchMock } from "./helpers.ts";

describe("provider manifest", () => {
  afterEach(resetFetchMock);

  it("binds each fetch result to its definition ID", () => {
    const definition: ProviderDefinition<"codex"> = codexProvider;
    const fetch: typeof definition.fetch = definition.fetch;

    expect(fetch).toBe(codexProvider.fetch);
  });

  it("defines every provider in display order", () => {
    expect(PROVIDERS.map((provider) => provider.id)).toStrictEqual([
      ...PROVIDER_ORDER,
    ]);

    for (const id of PROVIDER_ORDER) {
      expect(PROVIDER_REGISTRY[id].id).toBe(id);
      expect(defaultLabelFor(id)).toStrictEqual(
        PROVIDER_REGISTRY[id].defaultLabel
      );
    }
  });

  it("maps OpenCode session providers to plugin providers", () => {
    expect([
      ["openai", pluginProviderForOpenCode("openai")],
      ["deepseek", pluginProviderForOpenCode("deepseek")],
      ["moonshotai", pluginProviderForOpenCode("moonshotai")],
      ["moonshotai-cn", pluginProviderForOpenCode("moonshotai-cn")],
      ["novita-ai", pluginProviderForOpenCode("novita-ai")],
      ["openrouter", pluginProviderForOpenCode("openrouter")],
      ["zai-coding-plan", pluginProviderForOpenCode("zai-coding-plan")],
      ["minimax-coding-plan", pluginProviderForOpenCode("minimax-coding-plan")],
      ["minimax", pluginProviderForOpenCode("minimax")],
      [
        "bailian-token-plan-personal",
        pluginProviderForOpenCode("bailian-token-plan-personal"),
      ],
      ["qwen", pluginProviderForOpenCode("qwen")],
      ["opencode-go", pluginProviderForOpenCode("opencode-go")],
      ["commandcode", pluginProviderForOpenCode("commandcode")],
      ["anthropic", pluginProviderForOpenCode("anthropic")],
    ]).toStrictEqual([
      ["openai", "codex"],
      ["deepseek", "deepseek"],
      ["moonshotai", "moonshotai"],
      ["moonshotai-cn", "moonshotai-cn"],
      ["novita-ai", "novita-ai"],
      ["openrouter", "openrouter"],
      ["zai-coding-plan", "zai"],
      ["minimax-coding-plan", "minimax"],
      ["minimax", "minimax"],
      ["bailian-token-plan-personal", "qwen"],
      ["qwen", "qwen"],
      ["opencode-go", "opencode-go"],
      ["commandcode", "commandcode"],
      ["anthropic", null],
    ]);
  });

  it("returns enabled providers in display order", () => {
    expect(
      getProviderConfigs({
        enabled: true,
        providers: {
          codex: { enabled: true, label: "Codex" },
          minimax: { enabled: true, label: "MiniMax" },
          qwen: { enabled: true, label: "Qwen" },
          synthetic: { enabled: true, label: "Synthetic" },
          zai: { enabled: false, label: "ZAI" },
        },
        refreshIntervalSeconds: 60,
        requestTimeoutMs: 1000,
        showErrors: true,
      })
    ).toStrictEqual([
      ["codex", { enabled: true, label: "Codex" }],
      ["synthetic", { enabled: true, label: "Synthetic" }],
      ["minimax", { enabled: true, label: "MiniMax" }],
      ["qwen", { enabled: true, label: "Qwen" }],
    ]);
  });

  it("dispatches provider fetches by id", async () => {
    installFetchMock(
      Response.json({
        plan_type: "plus",
        rate_limit: { primary_window: { used_percent: 0 } },
        rate_limit_reset_credits: { available_count: 3 },
      })
    );

    const result: Promise<ProviderUsage<"codex">> = Effect.runPromise(
      fetchProviderEffect(
        "codex",
        { enabled: true },
        { openai: { access: "token", accountId: "account" } },
        1000
      ).pipe(Effect.provide(ProviderRuntimeLive))
    );
    await expect(result).resolves.toMatchObject({ id: "codex" });
  });

  it("dispatches Moonshot provider IDs through the registry definition", async () => {
    const fetchMock = installFetchMock(
      Response.json({
        code: 0,
        data: { available_balance: -2.5 },
        status: true,
      })
    );

    const usage = await Effect.runPromise(
      fetchProviderEffect(
        "moonshotai-cn",
        { apiKey: "china-key" },
        {},
        1000
      ).pipe(Effect.provide(ProviderRuntimeLive))
    );

    expect(fetchMock.mock.calls[0]).toMatchObject([
      "https://api.moonshot.cn/v1/users/me/balance",
      { headers: { Authorization: "Bearer china-key" } },
    ]);
    expect(usage).toMatchObject({
      id: "moonshotai-cn",
      windows: [
        {
          label: "CNY balance",
          quota: { _tag: "Balance", remaining: -2.5, unit: "CNY" },
        },
      ],
    });
  });

  it("rejects unknown provider ids asynchronously", async () => {
    const unknownEffect = fetchProviderEffect("unknown", undefined, {}, 1000);
    expect(unknownEffect).toBeDefined();
    await expect(
      Effect.runPromise(unknownEffect.pipe(Effect.provide(ProviderRuntimeLive)))
    ).rejects.toThrow("unknown provider: unknown");

    const unknownPromise = fetchProvider("unknown", undefined, {}, 1000);
    await expect(unknownPromise).rejects.toThrow("unknown provider: unknown");
  });
});
