import type { Context } from "@opencode/plugin/tui/context";
import type { RGBA } from "@opentui/core";

/** Session execution events that can change the composer hint state. */
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
  /** Subscribes to an execution event and returns its unsubscriber. */
  readonly on: (type: SessionExecutionEvent, handler: () => void) => () => void;
  /** Provides the normalized status for a session. */
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
  /** Accent color for the force-submit action. */
  readonly force: RGBA;
  /** Color for key glyphs. */
  readonly key: RGBA;
  /** Subdued color for explanatory labels. */
  readonly label: RGBA;
}

/** Distinguishes the structured v2 theme from the older flat one. */
const isV2Theme = (theme: ForceHintTheme): theme is V2Theme =>
  "default" in theme.text;

/**
 * Resolves semantic hint colors from either supported OpenCode theme shape.
 *
 * @param theme - Structured v2 theme or legacy flat theme.
 * @returns Colors for the force action, key label, and explanatory copy.
 */
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

/**
 * Determines whether the hint should be rendered for the supplied options.
 *
 * @param options - Plugin options; only an explicit `false` hides the hint.
 * @returns `true` unless `hint` is set to `false`.
 */
export const hintEnabled = (options: ForceHintOptions): boolean =>
  options.hint !== false;
