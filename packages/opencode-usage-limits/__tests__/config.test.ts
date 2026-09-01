import { afterEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { Redacted, Result } from "effect";

import {
  credentialValue,
  parseOpenCodeAuth,
  parseUsageLimitsConfig,
} from "@/config-schema.ts";
import { ConfigDecodeError, ConfigReadError } from "@/errors.ts";

const actualUtils = await import("@/utils.ts");
const originalReadJsonFile = actualUtils.readJsonFile;
const readJsonFile = mock(originalReadJsonFile);

mock.module("@/utils.ts", () => ({ ...actualUtils, readJsonFile }));

const testXdgConfigHome = path.join(homedir(), ".opencode-test-config");
const testXdgDataHome = path.join(homedir(), ".opencode-test-data");
const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;
const originalXdgDataHome = process.env.XDG_DATA_HOME;
process.env.XDG_CONFIG_HOME = testXdgConfigHome;
process.env.XDG_DATA_HOME = testXdgDataHome;
const { loadConfig, loadOpenCodeAuth, resolveXdgPath } =
  await import("@/config.ts");
if (originalXdgConfigHome === undefined) {
  delete process.env.XDG_CONFIG_HOME;
} else {
  process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
}
if (originalXdgDataHome === undefined) {
  delete process.env.XDG_DATA_HOME;
} else {
  process.env.XDG_DATA_HOME = originalXdgDataHome;
}

interface PublishedProviderDefinition {
  properties: object;
}

interface PublishedSchema {
  $defs: {
    codexProvider: PublishedProviderDefinition;
    commonDisplayFields: PublishedProviderDefinition;
    minimaxProvider: PublishedProviderDefinition;
    openCodeGoProvider: PublishedProviderDefinition;
    qwenProvider: PublishedProviderDefinition;
    syntheticProvider: PublishedProviderDefinition;
    zaiProvider: PublishedProviderDefinition;
  };
  properties: {
    providers: {
      properties: {
        codex: { $ref: "#/$defs/codexProvider" };
        minimax: { $ref: "#/$defs/minimaxProvider" };
        "opencode-go": { $ref: "#/$defs/openCodeGoProvider" };
        qwen: { $ref: "#/$defs/qwenProvider" };
        synthetic: { $ref: "#/$defs/syntheticProvider" };
        zai: { $ref: "#/$defs/zaiProvider" };
      };
    };
  };
}

const publishedSchema: PublishedSchema = JSON.parse(
  readFileSync(
    path.join(import.meta.dir, "..", "usage-limits.schema.json"),
    "utf-8"
  )
);

afterEach(() => {
  readJsonFile.mockReset();
  readJsonFile.mockImplementation(originalReadJsonFile);
});

describe("configuration parsing", () => {
  test("published schema matches provider-specific runtime fields", () => {
    const commonFields = Object.keys(
      publishedSchema.$defs.commonDisplayFields.properties
    ).toSorted();
    const providerFields = {
      codex: Object.keys(
        publishedSchema.$defs.codexProvider.properties
      ).toSorted(),
      minimax: Object.keys(
        publishedSchema.$defs.minimaxProvider.properties
      ).toSorted(),
      "opencode-go": Object.keys(
        publishedSchema.$defs.openCodeGoProvider.properties
      ).toSorted(),
      qwen: Object.keys(
        publishedSchema.$defs.qwenProvider.properties
      ).toSorted(),
      synthetic: Object.keys(
        publishedSchema.$defs.syntheticProvider.properties
      ).toSorted(),
      zai: Object.keys(publishedSchema.$defs.zaiProvider.properties).toSorted(),
    };

    expect(publishedSchema.properties.providers.properties).toEqual({
      codex: { $ref: "#/$defs/codexProvider" },
      minimax: { $ref: "#/$defs/minimaxProvider" },
      "opencode-go": { $ref: "#/$defs/openCodeGoProvider" },
      qwen: { $ref: "#/$defs/qwenProvider" },
      synthetic: { $ref: "#/$defs/syntheticProvider" },
      zai: { $ref: "#/$defs/zaiProvider" },
    });
    expect(providerFields.qwen).toEqual(commonFields);
    expect(providerFields.zai).toEqual(
      [...commonFields, "apiKey", "authPath", "authorizationScheme"].toSorted()
    );
    expect(providerFields.codex).toEqual(
      [
        ...commonFields,
        "apiKey",
        "authPath",
        "authorizationScheme",
        "baseUrl",
      ].toSorted()
    );
    const apiKeyProviders = [
      providerFields.minimax,
      providerFields["opencode-go"],
      providerFields.synthetic,
    ];
    for (const fields of apiKeyProviders) {
      expect(fields).toEqual(
        [...commonFields, "apiKey", "authPath", "baseUrl"].toSorted()
      );
    }
  });

  test("defaults only omitted top-level fields and accepts $schema", () => {
    const result = parseUsageLimitsConfig({
      $schema: "https://example.com/usage-limits.schema.json",
      providers: {},
      refreshIntervalSeconds: 15,
      requestTimeoutMs: 1000,
      showErrors: false,
    });

    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.success).toEqual({
        enabled: true,
        providers: {},
        refreshIntervalSeconds: 15,
        requestTimeoutMs: 1000,
        showErrors: false,
      });
    }
  });

  test("parses every provider field and redacts API keys", () => {
    const result = parseUsageLimitsConfig({
      providers: {
        codex: {
          apiKey: "do-not-log",
          authPath: "~/.codex/auth.json",
          authorizationScheme: "bearer",
          baseUrl: "https://example.com",
          enabled: true,
          footerWindow: "weekly",
          label: "Work",
          showFooterBar: false,
          showSidebarBar: true,
          sidebarWindow: "weekly",
        },
      },
    });

    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      const apiKey = result.success.providers.codex?.apiKey;
      expect(Redacted.isRedacted(apiKey)).toBe(true);
      expect(String(apiKey)).not.toContain("do-not-log");
      expect(result.success.providers.codex).toMatchObject({
        authPath: "~/.codex/auth.json",
        authorizationScheme: "bearer",
        baseUrl: "https://example.com",
        enabled: true,
        footerWindow: "weekly",
        label: "Work",
        showFooterBar: false,
        showSidebarBar: true,
        sidebarWindow: "weekly",
      });
    }
  });

  test.each([
    [{ enabled: "yes" }, "wrong boolean type"],
    [{ refreshIntervalSeconds: 14 }, "refresh minimum"],
    [{ refreshIntervalSeconds: Number.NaN }, "finite refresh"],
    [{ requestTimeoutMs: 999 }, "timeout minimum"],
    [{ providers: { codex: { authorizationScheme: "token" } } }, "enum"],
    [
      { providers: { qwen: { apiKey: "unsupported" } } },
      "unsupported provider field",
    ],
    [{ providers: { unknown: {} } }, "unknown provider"],
    [{ unknown: true }, "unknown top-level key"],
  ])("rejects %s (%s)", (input) => {
    const result = parseUsageLimitsConfig(input);
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure).toBeInstanceOf(ConfigDecodeError);
    }
  });

  test("redacts malformed credential values from diagnostics", () => {
    const credential = { secret: "never-render-this" };
    const result = parseUsageLimitsConfig({
      providers: { synthetic: { apiKey: credential } },
    });

    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(String(result.failure.cause)).not.toContain("never-render-this");
    }
  });
});

describe("configuration loading", () => {
  test.each([
    ["unset", undefined],
    ["empty", ""],
    ["relative", "config/opencode"],
  ])("uses the fallback for %s XDG paths", (_label, value) => {
    const fallback = path.join(homedir(), ".fallback");

    expect(resolveXdgPath(value, fallback)).toBe(fallback);
  });

  test("accepts an absolute XDG path", () => {
    const absolute = path.join(homedir(), ".xdg");

    expect(resolveXdgPath(absolute, path.join(homedir(), ".fallback"))).toBe(
      absolute
    );
  });

  test("returns defaults when no user config exists", async () => {
    readJsonFile.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { code: "ENOENT" })
    );

    const result = await loadConfig();
    expect(Result.isSuccess(result)).toBe(true);
    if (Result.isSuccess(result)) {
      expect(result.success.refreshIntervalSeconds).toBe(60);
    }
    expect(readJsonFile).toHaveBeenCalledWith(
      path.join(testXdgConfigHome, "opencode", "usage-limits.jsonc")
    );
  });

  test("returns typed read and JSONC decode failures", async () => {
    readJsonFile.mockRejectedValueOnce(new Error("permission denied"));
    const readResult = await loadConfig();
    expect(Result.isFailure(readResult)).toBe(true);
    if (Result.isFailure(readResult)) {
      expect(readResult.failure).toBeInstanceOf(ConfigReadError);
    }

    readJsonFile.mockRejectedValueOnce(new SyntaxError("malformed"));
    const decodeResult = await loadConfig();
    expect(Result.isFailure(decodeResult)).toBe(true);
    if (Result.isFailure(decodeResult)) {
      expect(decodeResult.failure).toBeInstanceOf(ConfigDecodeError);
    }
  });

  test("loads recognized auth fields as redacted values", async () => {
    readJsonFile.mockResolvedValueOnce({
      ignored: { value: true },
      openai: { access: "token", accountId: "account" },
    });

    const result = await loadOpenCodeAuth();
    expect(Redacted.isRedacted(result.auth.openai?.access)).toBe(true);
    expect(String(result.auth.openai?.access)).not.toContain("token");
    expect(result.diagnostic).toBeUndefined();
    expect(readJsonFile).toHaveBeenCalledWith(
      path.join(testXdgDataHome, "opencode", "auth.json")
    );
  });

  test("treats absent or malformed auth as empty", async () => {
    readJsonFile.mockRejectedValueOnce(new Error("missing"));
    await expect(loadOpenCodeAuth()).resolves.toMatchObject({
      auth: {},
      diagnostic: { kind: "auth-read" },
    });
  });

  test.each([
    [null, "OpenCode auth has an unsupported format"],
    [[], "OpenCode auth has an unsupported format"],
  ])(
    "reports malformed auth format %p without credentials",
    async (input, message) => {
      readJsonFile.mockResolvedValueOnce(input);

      await expect(loadOpenCodeAuth()).resolves.toEqual({
        auth: {},
        diagnostic: { kind: "auth-decode", message },
      });
    }
  );

  test("classifies auth parse and filesystem read errors separately", async () => {
    readJsonFile.mockRejectedValueOnce(new SyntaxError("malformed"));
    await expect(loadOpenCodeAuth()).resolves.toMatchObject({
      auth: {},
      diagnostic: {
        kind: "auth-decode",
        message: "OpenCode auth could not be parsed",
      },
    });

    readJsonFile.mockRejectedValueOnce(new Error("permission denied"));
    await expect(loadOpenCodeAuth()).resolves.toMatchObject({
      auth: {},
      diagnostic: {
        kind: "auth-read",
        message: "OpenCode auth could not be read",
      },
    });
  });

  test("classifies absent and malformed auth without exposing values", async () => {
    readJsonFile.mockRejectedValueOnce(
      Object.assign(new Error("missing"), { code: "ENOENT" })
    );
    await expect(loadOpenCodeAuth()).resolves.toMatchObject({
      auth: {},
      diagnostic: { kind: "auth-missing" },
    });

    readJsonFile.mockResolvedValueOnce({
      minimax: { apiKey: { secret: "do-not-log" }, key: "valid-key" },
    });
    const result = await loadOpenCodeAuth();
    expect(credentialValue(result.auth.minimax?.key)).toBe("valid-key");
    expect(result.diagnostic).toEqual({
      kind: "auth-decode",
      message: "Some OpenCode auth fields could not be read",
    });
    expect(JSON.stringify(result.diagnostic)).not.toContain("do-not-log");
    expect(parseOpenCodeAuth({ openai: { access: 42 } })).toEqual({});
  });

  test("keeps valid auth entries when another recognized entry is malformed", () => {
    const auth = parseOpenCodeAuth({
      minimax: { key: "valid-minimax" },
      openai: { access: "valid-openai", accountId: "valid-account" },
      synthetic: { key: 42 },
      zai: { key: "valid-zai" },
    });

    expect(credentialValue(auth.openai?.access)).toBe("valid-openai");
    expect(credentialValue(auth.minimax?.key)).toBe("valid-minimax");
    expect(credentialValue(auth.zai?.key)).toBe("valid-zai");
    expect(auth.synthetic).toBeUndefined();
  });

  test("keeps valid credential fields beside malformed sibling fields", () => {
    const auth = parseOpenCodeAuth({
      minimax: { apiKey: 42, ignored: "value", key: "valid-key" },
      openai: {
        access: "valid-access",
        accountId: { invalid: true },
        ignored: "value",
      },
    });

    expect(credentialValue(auth.minimax?.key)).toBe("valid-key");
    expect(auth.minimax?.apiKey).toBeUndefined();
    expect(credentialValue(auth.openai?.access)).toBe("valid-access");
    expect(auth.openai?.accountId).toBeUndefined();
  });
});
