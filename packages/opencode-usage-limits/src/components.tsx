/* @jsxImportSource @opentui/solid */
import type { RGBA } from "@opentui/core";
import { createMemo, For } from "solid-js";

import type { ConfigDiagnostic } from "@/config.ts";
import {
  bottomWindowMainText,
  formatQuotaText,
  formatTimestamp,
  percentBar,
  windowResetText,
  windowResetTime,
} from "@/format.ts";
import type {
  ProviderDisplayConfig,
  ProviderState,
  SidebarWindow,
  UsageWindow,
} from "@/types.ts";
import { quotaUsedPercent } from "@/usage.ts";

interface V2Theme {
  readonly text: {
    readonly default: RGBA;
    readonly subdued: RGBA;
    readonly feedback: {
      readonly warning: { readonly default: RGBA };
      readonly error: { readonly default: RGBA };
      readonly success: { readonly default: RGBA };
    };
  };
}

interface LegacyTheme {
  readonly text: RGBA;
  readonly textMuted: RGBA;
  readonly warning: RGBA;
  readonly error: RGBA;
  readonly success: RGBA;
}

export type UsageTheme = V2Theme | LegacyTheme;

interface ThemeColors {
  readonly text: RGBA;
  readonly subdued: RGBA;
  readonly warning: RGBA;
  readonly error: RGBA;
  readonly success: RGBA;
}

/** Local boundary for v2 theme data while the v2 plugin package is unavailable. */
const isV2Theme = (theme: UsageTheme): theme is V2Theme =>
  typeof theme.text === "object" &&
  theme.text !== null &&
  "feedback" in theme.text;

const resolveTheme = (theme: UsageTheme): ThemeColors => {
  if (!isV2Theme(theme)) {
    return {
      error: theme.error,
      subdued: theme.textMuted,
      success: theme.success,
      text: theme.text,
      warning: theme.warning,
    };
  }

  return {
    error: theme.text.feedback.error.default,
    subdued: theme.text.subdued,
    success: theme.text.feedback.success.default,
    text: theme.text.default,
    warning: theme.text.feedback.warning.default,
  };
};

const dotColor = (usedPercent: number | null, theme: ThemeColors): RGBA => {
  if (usedPercent === null) {
    return theme.subdued;
  }
  if (usedPercent >= 90) {
    return theme.error;
  }
  if (usedPercent >= 70) {
    return theme.warning;
  }
  return theme.success;
};

const UsageWindowRows = (props: {
  showBar: boolean;
  theme: ThemeColors;
  windows: readonly UsageWindow[];
}) => (
  <For each={props.windows}>
    {(window) => {
      const usedPercent = quotaUsedPercent(window.quota);
      const showBar = props.showBar && window.quota._tag !== "Balance";
      const quotaText = formatQuotaText(window.quota, true);
      return (
        <box flexDirection="column">
          <text>
            <span style={{ fg: props.theme.subdued }}>{"  "}</span>
            <span style={{ fg: props.theme.text }}>
              <b>{window.label}</b>
            </span>
            <span style={{ fg: props.theme.subdued }}>
              {windowResetText(window)}
              {windowResetTime(window)}
            </span>
          </text>
          <text>
            <span style={{ fg: props.theme.subdued }}>{"  "}</span>
            {showBar ? (
              <span
                style={{
                  fg: dotColor(usedPercent, props.theme),
                }}
              >
                {percentBar(usedPercent, 12)}
              </span>
            ) : null}
            <span
              style={{
                fg: dotColor(usedPercent, props.theme),
              }}
            >
              {" "}
              {quotaText}
            </span>
          </text>
        </box>
      );
    }}
  </For>
);

/**
 * Determines whether a provider state has visible sidebar content.
 *
 * @param state - Current state of one provider.
 * @param showErrors - Whether provider errors should be displayed.
 * @returns `true` when usage or a permitted error should be rendered.
 */
export const shouldRenderProviderState = (
  state: ProviderState,
  showErrors: boolean
): boolean => {
  if (state.status === "disabled") {
    return false;
  }
  if (state.status !== "error") {
    return true;
  }
  if (state.previous) {
    return true;
  }

  return showErrors && state.errorKind !== "missing_credentials";
};

/**
 * Renders provider usage, diagnostics, stale state, and refresh time in the sidebar.
 *
 * @param props - Provider snapshots and visual preferences for the panel.
 * @returns The sidebar panel, or `null` when there is nothing to display.
 */
export const UsageLimitsPanel = (props: {
  /** Optional non-fatal configuration and auth diagnostics. */
  diagnostics?: readonly ConfigDiagnostic[];
  /** Current states for enabled providers. */
  states: readonly ProviderState[];
  /** Whether provider errors should be included in the panel. */
  showErrors: boolean;
  /** Active OpenCode theme. */
  theme: UsageTheme;
  /** Timestamp of the last completed refresh, or `null` before the first. */
  lastRefreshAt: Date | null;
  /** Per-provider display preferences resolved from configuration. */
  providerDisplays: Readonly<
    Partial<Record<ProviderState["id"], ProviderDisplayConfig>>
  >;
}) => {
  const colors = resolveTheme(props.theme);
  const displayConfigFor = (state: ProviderState): ProviderDisplayConfig =>
    props.providerDisplays[state.id] ?? {
      footerWindow: "auto",
      showFooterBar: true,
      showSidebarBar: true,
      sidebarWindow: "all",
    };
  const filteredWindowsFor = (
    state: ProviderState,
    windows: readonly UsageWindow[]
  ): UsageWindow[] => {
    const sidebarWindow: SidebarWindow = displayConfigFor(state).sidebarWindow;
    return sidebarWindow === "all"
      ? [...windows]
      : windows.filter(
          (window) =>
            window.kind === sidebarWindow ||
            (sidebarWindow === "rolling" && window.label === "5h")
        );
  };
  const visibleStates = createMemo(() =>
    props.states.filter((state) => {
      if (!shouldRenderProviderState(state, props.showErrors)) {
        return false;
      }
      if (state.status === "ready") {
        return filteredWindowsFor(state, state.data.windows).length > 0;
      }
      if (state.status === "error" && state.previous) {
        return filteredWindowsFor(state, state.previous.windows).length > 0;
      }
      return true;
    })
  );

  const diagnostics = props.diagnostics ?? [];
  if (visibleStates().length === 0 && diagnostics.length === 0) {
    return null;
  }

  return (
    <box flexDirection="column">
      <text fg={colors.text}>
        <b>Usage Limits</b>
      </text>
      <For each={diagnostics}>
        {(diagnostic) => <text fg={colors.error}>{diagnostic.message}</text>}
      </For>
      <For each={visibleStates()}>
        {(state) => {
          let tierName: string | undefined;
          if (state.status === "ready") {
            ({ tierName } = state.data);
          } else if (state.status === "error" && state.previous) {
            ({ tierName } = state.previous);
          }
          const isStale = state.status === "ready" && state.stale;
          const isCached =
            state.status === "error" && state.previous !== undefined;

          return (
            <box flexDirection="column">
              <text fg={colors.text}>
                {state.label}
                {tierName ? (
                  <span style={{ fg: colors.subdued }}>
                    {" ["}
                    {tierName}
                    {"]"}
                  </span>
                ) : null}
                {isStale ? (
                  <span style={{ fg: colors.warning }}> stale</span>
                ) : null}
                {isCached ? (
                  <span style={{ fg: colors.warning }}> cached</span>
                ) : null}
              </text>
              {state.status === "loading" ? (
                <text fg={colors.subdued}> loading...</text>
              ) : null}
              {state.status === "ready" ? (
                <UsageWindowRows
                  showBar={displayConfigFor(state).showSidebarBar}
                  theme={colors}
                  windows={filteredWindowsFor(state, state.data.windows)}
                />
              ) : null}
              {state.status === "error" && state.previous ? (
                <UsageWindowRows
                  showBar={displayConfigFor(state).showSidebarBar}
                  theme={colors}
                  windows={filteredWindowsFor(state, state.previous.windows)}
                />
              ) : null}
              {state.status === "error" && props.showErrors ? (
                <text fg={colors.error}> {state.message}</text>
              ) : null}
            </box>
          );
        }}
      </For>
      {props.lastRefreshAt ? (
        <text fg={colors.subdued}>
          Updated {formatTimestamp(props.lastRefreshAt)}
        </text>
      ) : null}
    </box>
  );
};

/**
 * Renders the compact active-provider usage indicator in the prompt footer.
 *
 * @param props - Active usage window and active TUI theme.
 * @returns Solid/OpenTUI JSX for the prompt footer slot.
 */
export const BottomUsage = (props: {
  /** Whether to render a usage bar before the text. */
  showBar: boolean;
  /** Active provider window, or `null` when no usage is available. */
  window: UsageWindow | null;
  /** Active OpenCode theme. */
  theme: UsageTheme;
}) => {
  const colors = resolveTheme(props.theme);
  if (!props.window) {
    return null;
  }
  const usedPercent = quotaUsedPercent(props.window.quota);
  const showBar = props.showBar && props.window.quota._tag !== "Balance";

  return (
    <text>
      {showBar ? (
        <span
          style={{
            fg: dotColor(usedPercent, colors),
          }}
        >
          {percentBar(usedPercent, 8)}
        </span>
      ) : null}
      <span style={{ fg: colors.text }}>
        {" "}
        {bottomWindowMainText(props.window)}
      </span>
      <span style={{ fg: colors.subdued }}>
        {windowResetText(props.window)}
      </span>
    </text>
  );
};
