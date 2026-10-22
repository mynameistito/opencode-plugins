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

interface CurrentV2Theme {
  readonly text: {
    readonly base: RGBA;
    readonly muted: RGBA;
    readonly action: { readonly primary: { readonly base: RGBA } };
  };
}

interface PreviousV2Theme {
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
 * Theme token shapes seen across OpenCode v2 builds, plus the older flat
 * theme shape. Both are accepted so the hint renders across host versions.
 */
export type ForceHintTheme = CurrentV2Theme | PreviousV2Theme | LegacyTheme;

export interface HintColors {
  /** Accent color for the force-submit action. */
  readonly force: RGBA;
  /** Color for key glyphs. */
  readonly key: RGBA;
  /** Subdued color for explanatory labels. */
  readonly label: RGBA;
}

/** Identifies the current structured theme tokens. */
const isCurrentV2Theme = (theme: ForceHintTheme): theme is CurrentV2Theme =>
  "base" in theme.text;

/** Identifies the earlier structured theme tokens. */
const isPreviousV2Theme = (theme: ForceHintTheme): theme is PreviousV2Theme =>
  "default" in theme.text;

/**
 * Resolves semantic hint colors from either supported OpenCode theme shape.
 *
 * @param theme - Structured v2 theme or legacy flat theme.
 * @returns Colors for the force action, key label, and explanatory copy.
 */
export const resolveHintColors = (theme: ForceHintTheme): HintColors => {
  if (isCurrentV2Theme(theme)) {
    return {
      force: theme.text.action.primary.base,
      key: theme.text.base,
      label: theme.text.muted,
    };
  }

  if (isPreviousV2Theme(theme)) {
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
