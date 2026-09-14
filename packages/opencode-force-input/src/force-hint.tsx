import type { JSX } from "@opentui/solid";
/* @jsxImportSource @opentui/solid */
import { createMemo, createSignal, onCleanup, Show } from "solid-js";

import {
  HINT_TEXT,
  resolveHintColors,
  SESSION_EXECUTION_EVENTS,
} from "./hint.ts";
import type { ForceHintData, ForceHintTheme } from "./hint.ts";

export interface ForceHintProps {
  readonly data: ForceHintData;
  readonly enabled: boolean;
  readonly mode: "normal" | "shell";
  readonly sessionID: string | undefined;
  readonly theme: ForceHintTheme;
}

/**
 * State-aware hint rendered inside the composer, bottom right of the prompt
 * box. The host publishes no slot inside the textarea, so the hint claims
 * `prompt.footer.status` (the footer row directly below the border) and is
 * lifted by an absolute overlay: one row up is the bottom border, two rows up
 * is the composer's own info row, whose right side is empty space.
 */
export const ForceHint = (props: ForceHintProps): JSX.Element => {
  const [tick, setTick] = createSignal(0);
  const bump = (): void => {
    setTick((value) => value + 1);
  };
  const unsubscribes = SESSION_EXECUTION_EVENTS.map((event) =>
    props.data.on(event, bump)
  );
  onCleanup(() => {
    for (const unsubscribe of unsubscribes) {
      unsubscribe();
    }
  });

  // Reading status is reactive on its own; the tick also covers hosts whose
  // execution events update caches outside tracking scopes.
  const status = createMemo(() => {
    tick();
    const { sessionID } = props;
    return sessionID ? props.data.session.status(sessionID) : undefined;
  });
  // `"running"` is the data layer's active state: it covers busy sessions and
  // automatic retries, so the steer hint stays until the run settles.
  const running = createMemo(() => status() === "running");
  const colors = createMemo(() => resolveHintColors(props.theme));

  return (
    <Show
      when={props.enabled && props.mode === "normal" && status() !== undefined}
    >
      <box flexShrink={0} position="absolute" right={2} top={-2} zIndex={1}>
        <Show
          fallback={
            <text fg={colors().key} wrapMode="none">
              ⏎ <span style={{ fg: colors().label }}>{HINT_TEXT.idle}</span>
            </text>
          }
          when={running()}
        >
          <text fg={colors().key} wrapMode="none">
            ⏎{" "}
            <span style={{ fg: colors().label }}>
              {`${HINT_TEXT.running} · `}
            </span>
            <span style={{ fg: colors().force }}>{HINT_TEXT.forceKey}</span>
            <span style={{ fg: colors().label }}>{` ${HINT_TEXT.force}`}</span>
          </text>
        </Show>
      </box>
    </Show>
  );
};
