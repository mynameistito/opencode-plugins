import { homedir } from "node:os";
import path from "node:path";

import { Result } from "effect";

import { parseOpenCodeAuth, parseUsageLimitsConfig } from "@/config-schema.ts";
import { ConfigDecodeError, ConfigReadError } from "@/errors.ts";
import type { OpenCodeAuth, ResolvedUsageLimitsConfig } from "@/types.ts";
import { isRecord, isString, readJsonFile } from "@/utils.ts";
import type { JsonValue } from "@/utils.ts";

/** Reads and parses one JSON-compatible configuration or auth file. */
export type ConfigFileReader = (filePath: string) => Promise<JsonValue>;

/**
 * Resolves an XDG directory only when the environment value is absolute.
 *
 * @param value - The XDG environment value to inspect.
 * @param fallback - The platform-specific directory to use otherwise.
 * @returns The accepted XDG directory or the fallback directory.
 */
export const resolveXdgPath = (
  value: string | undefined,
  fallback: string
): string => (value && path.isAbsolute(value) ? value : fallback);

/** Default user configuration path for this plugin. */
const CONFIG_PATH = path.join(
  resolveXdgPath(process.env.XDG_CONFIG_HOME, path.join(homedir(), ".config")),
  "opencode",
  "usage-limits.jsonc"
);
/**
 * Resolves OpenCode's default auth-file path for the given runtime platform.
 *
 * @param platform - Runtime platform identifier, such as `win32` or `linux`.
 * @param dataHome - Absolute XDG data directory override, if configured.
 * @param localAppData - Windows local application-data directory, if available.
 * @param home - User home directory used as the final fallback.
 * @returns Absolute path to OpenCode's `auth.json` file.
 */
export const defaultOpenCodeAuthPath = (
  platform: string,
  dataHome: string | undefined,
  localAppData: string | undefined,
  home: string
): string =>
  path.join(
    resolveXdgPath(
      dataHome,
      platform === "win32"
        ? (localAppData ?? path.join(home, "AppData", "Local"))
        : path.join(home, ".local", "share")
    ),
    "opencode",
    "auth.json"
  );
const OPENCODE_AUTH_PATH = defaultOpenCodeAuthPath(
  process.platform,
  process.env.XDG_DATA_HOME,
  process.env.LOCALAPPDATA,
  homedir()
);

/** Fully resolved defaults used when no plugin config exists. */
export const DEFAULT_CONFIG: ResolvedUsageLimitsConfig = {
  enabled: true,
  providers: {},
  refreshIntervalSeconds: 60,
  requestTimeoutMs: 10_000,
  showErrors: true,
};

const isMissingFile = (error: Error): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

/** Non-fatal issue encountered while loading configuration or auth data. */
export type ConfigDiagnostic =
  | { readonly kind: "config-read"; readonly message: string }
  | { readonly kind: "config-decode"; readonly message: string }
  | { readonly kind: "auth-missing"; readonly message: string }
  | { readonly kind: "auth-read"; readonly message: string }
  | { readonly kind: "auth-decode"; readonly message: string };

export interface OpenCodeAuthLoad {
  /** Recognized credentials; empty when auth is unavailable or invalid. */
  readonly auth: OpenCodeAuth;
  /** Non-fatal diagnostic describing why auth could not be fully loaded. */
  readonly diagnostic?: ConfigDiagnostic;
}

const AUTH_DECODE_KIND = "auth-decode" as const;

const authEntryNames = new Set([
  "deepseek",
  "minimax",
  "minimax-coding-plan",
  "minimax-token-plan",
  "openai",
  "opencode",
  "opencode-go",
  "synthetic",
  "zai",
  "zai-coding-plan",
]);
const authFields = new Set(["access", "accountId", "apiKey", "key"]);
const directAuthFieldNames = new Set(["apiKey", "key"]);

const hasMalformedAuthField = (input: JsonValue): boolean => {
  if (!isRecord(input)) {
    return true;
  }
  return Object.entries(input).some(
    ([key, value]) => authFields.has(key) && !isString(value)
  );
};

/**
 * Reads and validates the user's usage-limits configuration file.
 *
 * Missing files resolve to {@link DEFAULT_CONFIG}; read and decode failures are
 * returned as typed failures rather than thrown.
 *
 * @param read - Injectable file reader, defaulting to the filesystem reader.
 * @returns Resolved configuration or a typed read/decode failure.
 */
export const loadConfig = async (
  read: ConfigFileReader = readJsonFile
): Promise<
  Result.Result<ResolvedUsageLimitsConfig, ConfigReadError | ConfigDecodeError>
> => {
  try {
    return parseUsageLimitsConfig(await read(CONFIG_PATH));
  } catch (error) {
    if (error instanceof Error && isMissingFile(error)) {
      return Result.succeed(DEFAULT_CONFIG);
    }
    if (error instanceof SyntaxError) {
      return Result.fail(
        new ConfigDecodeError({ cause: "syntax", operation: "parse-jsonc" })
      );
    }
    return Result.fail(
      new ConfigReadError({
        cause: "filesystem",
        operation: "read-config",
        path: CONFIG_PATH,
      })
    );
  }
};

/**
 * Reads supported credentials from OpenCode's shared auth file.
 *
 * Auth-file absence and read/decode problems are reported as non-fatal
 * diagnostics so provider-specific credential sources can still be tried.
 *
 * @param read - Injectable file reader, defaulting to the filesystem reader.
 * @returns Recognized auth values and an optional diagnostic.
 */
export const loadOpenCodeAuth = async (
  read: ConfigFileReader = readJsonFile
): Promise<OpenCodeAuthLoad> => {
  try {
    const input = await read(OPENCODE_AUTH_PATH);
    if (!isRecord(input)) {
      return {
        auth: {},
        diagnostic: {
          kind: AUTH_DECODE_KIND,
          message: "OpenCode auth has an unsupported format",
        },
      };
    }
    const auth = parseOpenCodeAuth(input);
    const malformed = Object.entries(input).some(([key, value]) =>
      authEntryNames.has(key)
        ? hasMalformedAuthField(value)
        : directAuthFieldNames.has(key) && !isString(value)
    );
    return malformed
      ? {
          auth,
          diagnostic: {
            kind: "auth-decode",
            message: "Some OpenCode auth fields could not be read",
          },
        }
      : { auth };
  } catch (error) {
    if (error instanceof Error && isMissingFile(error)) {
      return {
        auth: {},
        diagnostic: {
          kind: "auth-missing",
          message: "OpenCode auth file was not found",
        },
      };
    }
    if (error instanceof SyntaxError) {
      return {
        auth: {},
        diagnostic: {
          kind: AUTH_DECODE_KIND,
          message: "OpenCode auth could not be parsed",
        },
      };
    }
    return {
      auth: {},
      diagnostic: {
        kind: "auth-read",
        message: "OpenCode auth could not be read",
      },
    };
  }
};
