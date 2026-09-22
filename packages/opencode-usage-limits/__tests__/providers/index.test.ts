import { Effect } from "effect";
import { afterEach, describe, expect, test } from "vitest";

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

  test("binds each fetch result to its definition ID", () => {
    const definition: ProviderDefinition<"codex"> = codexProvider;
    const fetch: typeof definition.fetch = definition.fetch;

    expect(fetch).toBe(codexProvider.fetch);
  });

  test("defines every provider in display order", () => {
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

  test("maps OpenCode session providers to plugin providers", () => {
    expect([
      ["openai", pluginProviderForOpenCode("openai")],
      ["zai-coding-plan", pluginProviderForOpenCode("zai-coding-plan")],
      ["minimax-coding-plan", pluginProviderForOpenCode("minimax-coding-plan")],
      ["minimax", pluginProviderForOpenCode("minimax")],
      [
        "bailian-token-plan-personal",
        pluginProviderForOpenCode("bailian-token-plan-personal"),
      ],
      ["qwen", pluginProviderForOpenCode("qwen")],
      ["opencode-go", pluginProviderForOpenCode("opencode-go")],
      ["anthropic", pluginProviderForOpenCode("anthropic")],
    ]).toStrictEqual([
      ["openai", "codex"],
      ["zai-coding-plan", "zai"],
      ["minimax-coding-plan", "minimax"],
      ["minimax", "minimax"],
      ["bailian-token-plan-personal", "qwen"],
      ["qwen", "qwen"],
      ["opencode-go", "opencode-go"],
      ["anthropic", null],
    ]);
  });

  test("returns enabled providers in display order", () => {
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

  test("dispatches provider fetches by id", async () => {
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

  test("rejects unknown provider ids", () => {
    // SAFETY: This deliberately exercises the runtime unknown-ID branch.
    expect(() =>
      fetchProvider("unknown" as never, undefined, {}, 1000)
    ).toThrow("unknown provider: unknown");
  });
});
