import type { Redacted } from "effect";

import type { ResetInstant, UsageQuota, UsageWindowKind } from "@/usage.ts";

/** Requested sidebar window filter, or all available windows. */
export type SidebarWindow = "all" | UsageWindowKind;

/** Requested provider footer window, or the provider's automatic choice. */
export type FooterWindow = "auto" | UsageWindowKind;

/** Resolved display settings for one provider. */
export interface ProviderDisplayConfig {
  /** Whether quota bars are shown beside this provider in the sidebar. */
  readonly showSidebarBar: boolean;
  /** Whether a quota bar is shown beside this provider in the prompt footer. */
  readonly showFooterBar: boolean;
  /** Sidebar quota window to display, or all provider windows. */
  readonly sidebarWindow: SidebarWindow;
  /** Prompt-footer quota window, or the provider's automatic choice. */
  readonly footerWindow: FooterWindow;
}

/** Provider adapters supported by the usage-limits plugin. */
export type ProviderID =
  | "alibaba-token-plan"
  | "codex"
  | "zai"
  | "synthetic"
  | "minimax"
  | "qwen"
  | "opencode-go"
  | "commandcode";

/** Sensitive string accepted by parsed config and legacy provider boundaries. */
type Credential = Redacted.Redacted<string> | string;
type OpenCodeAuthCredential = Credential | null;

interface OpenCodeAuthEntry {
  readonly key?: OpenCodeAuthCredential;
  readonly apiKey?: OpenCodeAuthCredential;
}

interface OpenCodeOpenAIAuthEntry {
  readonly access?: OpenCodeAuthCredential;
  readonly accountId?: OpenCodeAuthCredential;
}

/**
 * Normalized usage information for one provider quota window.
 *
 * A provider can expose multiple windows, such as a short rolling window and a
 * longer daily or monthly cap. Percentages are nullable because some providers
 * report counts without a reliable percentage.
 */
export interface UsageWindow {
  /** Stable semantic window kind independent of its display label. */
  readonly kind: UsageWindowKind;
  /** Human-readable window label displayed in the TUI. */
  readonly label: string;
  /** Explicit percentage, count, or unknown quota representation. */
  readonly quota: UsageQuota;
  /** Canonical absolute reset instant when reported by the provider. */
  readonly resetsAt: ResetInstant | null;
}

/** Normalized usage payload returned by each provider adapter. */
export interface ProviderUsage<ID extends ProviderID = ProviderID> {
  /** Provider adapter that produced the data. */
  readonly id: ID;
  /** Display label for the provider. */
  readonly label: string;
  /** Optional plan or tier name inferred from provider data. */
  readonly tierName?: string;
  /** Time at which this usage snapshot was captured. */
  readonly capturedAt: Date;
  /** Quota windows exposed by the provider. */
  readonly windows: readonly UsageWindow[];
  /** Provider-specific values useful for display or diagnostics. */
  readonly metadata?: Readonly<
    Record<string, string | number | boolean | null>
  >;
}

/** Structured provider error categories used by UI behavior. */
type ProviderErrorKind = "missing_credentials";

/**
 * UI state for a provider across refresh cycles.
 *
 * Error states may carry a previous successful usage payload so the UI can keep
 * showing stale usage while surfacing the fetch error.
 */
export type ProviderState =
  /** Provider is omitted from refresh and display. */
  | { id: ProviderID; label: string; status: "disabled" }
  /** Provider usage request is in progress. */
  | { id: ProviderID; label: string; status: "loading" }
  | {
      /** Provider adapter identifier. */
      id: ProviderID;
      /** Resolved display label. */
      label: string;
      /** A successful fetch has produced usage data. */
      status: "ready";
      /** Most recent normalized provider usage. */
      data: ProviderUsage;
      /** Whether the data is older than two refresh intervals. */
      stale: boolean;
    }
  | {
      /** Provider adapter identifier. */
      id: ProviderID;
      /** Resolved display label. */
      label: string;
      /** Most recent fetch failed. */
      status: "error";
      /** Machine-readable category when the error has one. */
      errorKind?: ProviderErrorKind;
      /** Safe message suitable for display in the TUI. */
      message: string;
      /** Last successful data retained for stale-data display. */
      previous?: ProviderUsage;
    };

/** Configuration fields shared by every provider. */
interface CommonProviderConfig {
  /** Whether this provider should be fetched and displayed. */
  readonly enabled?: boolean;
  /** Optional provider display label override. */
  readonly label?: string;
  /** Whether to show the provider's sidebar quota bar. Defaults to `true`. */
  readonly showSidebarBar?: boolean;
  /** Whether to show the provider's footer quota bar. Defaults to `true`. */
  readonly showFooterBar?: boolean;
  /** Which quota window to display in the sidebar. Defaults to `all`. */
  readonly sidebarWindow?: SidebarWindow;
  /** Preferred usage window for this provider's prompt footer. */
  readonly footerWindow?: FooterWindow;
}

/** Codex provider configuration. */
export interface CodexProviderConfig extends CommonProviderConfig {
  /** Optional path to a Codex auth file. Supports a leading `~`. */
  readonly authPath?: string;
  /** Optional API base URL override for explicitly configured auth files. */
  readonly baseUrl?: string;
  /** Codex API credential override. */
  readonly apiKey?: Credential;
  /** Authorization scheme used for the configured API key. */
  readonly authorizationScheme?: "raw" | "bearer";
}

/** ZAI provider configuration. */
export interface ZaiProviderConfig extends CommonProviderConfig {
  /** ZAI API credential override. */
  readonly apiKey?: Credential;
  /** Optional path to an auth file; supports a leading `~`. */
  readonly authPath?: string;
  /** Authorization header scheme used with the API key. */
  readonly authorizationScheme?: "raw" | "bearer";
}

/** Synthetic provider configuration. */
export interface SyntheticProviderConfig extends CommonProviderConfig {
  /** Synthetic API credential override. */
  readonly apiKey?: Credential;
  /** Optional path to an auth file; supports a leading `~`. */
  readonly authPath?: string;
  /** HTTPS API base URL override. */
  readonly baseUrl?: string;
}

/** MiniMax provider configuration. */
export interface MiniMaxProviderConfig extends CommonProviderConfig {
  /** MiniMax Token Plan API credential override. */
  readonly apiKey?: Credential;
  /** Optional path to an auth file; supports a leading `~`. */
  readonly authPath?: string;
  /** HTTPS API base URL override. */
  readonly baseUrl?: string;
}

/** Qwen settings; provider credentials are obtained from the Qwen CLI. */
export type QwenProviderConfig = CommonProviderConfig;

/** Alibaba Personal/Solo Token Plan, read through the authenticated Bailian CLI. */
export interface AlibabaTokenPlanProviderConfig extends CommonProviderConfig {
  /** Bailian service region used by the CLI. */
  readonly region?: "international" | "china";
}

/** OpenCode GO provider configuration. */
export interface OpenCodeGoProviderConfig extends CommonProviderConfig {
  /** OpenCode GO API credential override. */
  readonly apiKey?: Credential;
  /** Optional path to an auth file; supports a leading `~`. */
  readonly authPath?: string;
  /** HTTPS API base URL override. */
  readonly baseUrl?: string;
}

/** Command Code provider configuration. */
export interface CommandCodeProviderConfig extends CommonProviderConfig {
  /** Command Code API credential override. */
  readonly apiKey?: Credential;
  /** Optional path to an auth file; supports a leading `~`. */
  readonly authPath?: string;
  /** HTTPS API base URL override. */
  readonly baseUrl?: string;
}

/** Provider configuration indexed by literal provider ID. */
export interface ProviderConfigMap {
  /** Alibaba Personal/Solo Token Plan settings. */
  readonly "alibaba-token-plan": AlibabaTokenPlanProviderConfig;
  /** Codex settings. */
  readonly codex: CodexProviderConfig;
  /** MiniMax Token Plan settings. */
  readonly minimax: MiniMaxProviderConfig;
  /** Qwen CLI settings. */
  readonly qwen: QwenProviderConfig;
  /** Synthetic settings. */
  readonly synthetic: SyntheticProviderConfig;
  /** ZAI Coding Plan settings. */
  readonly zai: ZaiProviderConfig;
  /** OpenCode GO settings. */
  readonly "opencode-go": OpenCodeGoProviderConfig;
  /** Command Code settings. */
  readonly commandcode: CommandCodeProviderConfig;
}

/** Any provider-specific configuration. */
export type ProviderConfig = ProviderConfigMap[ProviderID];

/** Fully resolved plugin configuration returned by the config parser. */
export interface ResolvedUsageLimitsConfig {
  /** Whether the plugin fetches and displays provider usage. */
  readonly enabled: boolean;
  /** Per-provider settings after defaults have been applied. */
  readonly providers: Readonly<Partial<ProviderConfigMap>>;
  /** Minimum delay between refresh cycles, in seconds. */
  readonly refreshIntervalSeconds: number;
  /** Maximum duration of one provider request, in milliseconds. */
  readonly requestTimeoutMs: number;
  /** Whether provider and configuration errors appear in the sidebar. */
  readonly showErrors: boolean;
}

/**
 * Subset of OpenCode's auth file consumed by this plugin.
 *
 * Provider adapters tolerate missing fields and may fall back to provider-owned
 * auth files or explicit configuration values.
 */
export interface OpenCodeAuth {
  /** Direct credential fields accepted by legacy provider auth payloads. */
  readonly key?: OpenCodeAuthCredential;
  readonly apiKey?: OpenCodeAuthCredential;
  /** OpenAI/Codex credentials stored by OpenCode. */
  openai?: OpenCodeOpenAIAuthEntry | null;
  /** ZAI Coding Plan credentials stored under OpenCode's provider ID. */
  "zai-coding-plan"?: OpenCodeAuthEntry | null;
  /** ZAI credentials stored under the plugin's normalized provider ID. */
  zai?: OpenCodeAuthEntry | null;
  /** Synthetic credentials stored under OpenCode's provider ID. */
  synthetic?: OpenCodeAuthEntry | null;
  /** MiniMax Token Plan credentials stored under the plugin's provider ID. */
  minimax?: OpenCodeAuthEntry | null;
  /** MiniMax Token Plan credentials stored under the OpenCode convention ID. */
  "minimax-coding-plan"?: OpenCodeAuthEntry | null;
  /** MiniMax Token Plan credentials stored under an alternate OpenCode ID. */
  "minimax-token-plan"?: OpenCodeAuthEntry | null;
  /** OpenCode GO credentials stored under the provider's catalog ID. */
  "opencode-go"?: OpenCodeAuthEntry | null;
  /** Command Code credentials stored under OpenCode's provider ID. */
  commandcode?: OpenCodeAuthEntry | null;
  /** OpenCode Zen credentials stored under the legacy provider ID. */
  opencode?: OpenCodeAuthEntry | null;
}
