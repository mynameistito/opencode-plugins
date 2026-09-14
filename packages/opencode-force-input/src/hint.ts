import type { Context } from "@opencode-ai/plugin/tui/context";
import type { RGBA } from "@opentui/core";

/** Execution lifecycle events that can change the session's idle/running state. */
export const SESSION_EXECUTION_EVENTS = [
  "session.execution.started",
  "session.execution.succeeded",
  "session.execution.failed",
  "session.execution.interrupted",
] as const;

type SessionExecutionEvent = (typeof SESSION_EXECUTION_EVENTS)[number];

/**
 * Session status exposed by the OpenCode v2 TUI data layer, derived from the
 * host context so a contract change fails typecheck. The protocol-level
 * `SessionStatus` object (`{ type: "idle" | "busy" | "retry" }`) is normalized
 * before plugins see it: a busy session and an automatic retry both read as
 * `"running"` until a terminal execution event returns the session to `"idle"`.
 */
export type SessionStatus = ReturnType<Context["data"]["session"]["status"]>;

/** Minimal data surface the hint needs; keeps the context fakeable in tests. */
export interface ForceHintData {
  readonly on: (type: SessionExecutionEvent, handler: () => void) => () => void;
  readonly session: {
    readonly status: (sessionID: string) => SessionStatus;
  };
}

interface V2Theme {
  readonly text: {
    readonly default: RGBA;
    readonly subdued: RGBA;
    readonly action: { readonly primary: { readonly default: RGBA } };
  };
}

interface LegacyTheme {
  readonly text: RGBA;
  readonly textMuted?: RGBA;
  readonly warning?: RGBA;
}

/**
 * Theme shapes seen across OpenCode v2 builds: the structured v2 theme and the
 * older flat one. Both are accepted so the hint renders on either host.
 */
export type ForceHintTheme = V2Theme | LegacyTheme;

export interface HintColors {
  readonly force: RGBA;
  readonly key: RGBA;
  readonly label: RGBA;
}

/** Distinguishes the structured v2 theme from the older flat one. */
const isV2Theme = (theme: ForceHintTheme): theme is V2Theme =>
  "default" in theme.text;

/** Resolves the hint palette from either theme shape. */
export const resolveHintColors = (theme: ForceHintTheme): HintColors => {
  if (isV2Theme(theme)) {
    return {
      force: theme.text.action.primary.default,
      key: theme.text.default,
      label: theme.text.subdued,
    };
  }
  return {
    force: theme.warning ?? theme.text,
    key: theme.text,
    label: theme.textMuted ?? theme.text,
  };
};

/** Composer hint copy for each session state. */
export const HINT_TEXT = {
  force: "interrupt & send",
  forceKey: "ctrl+⏎",
  idle: "send",
  running: "steer",
} as const;

/** Plugin options accepted by the force-input hint. */
export interface ForceHintOptions {
  readonly hint?: boolean;
}

/** Reads the plugin option that can disable the hint. */
export const hintEnabled = (options: ForceHintOptions): boolean =>
  options.hint !== false;
