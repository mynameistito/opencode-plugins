/* @jsxImportSource @opentui/solid */
import { afterEach, describe, expect, test } from "bun:test";

import { RGBA } from "@opentui/core";
import type { TestRendererSetup } from "@opentui/core/testing";
import { testRender } from "@opentui/solid";
import { createSignal } from "solid-js";

import { ForceHint } from "../src/force-hint.tsx";
import { hintEnabled, resolveHintColors } from "../src/hint.ts";
import type {
  ForceHintData,
  SessionStatus,
  SESSION_EXECUTION_EVENTS,
} from "../src/hint.ts";

type SessionExecutionEvent = (typeof SESSION_EXECUTION_EVENTS)[number];
type FiredEvent = SessionExecutionEvent | "session.retry.scheduled";

const v2Theme = {
  text: {
    action: { primary: { default: RGBA.fromInts(154, 176, 255) } },
    default: RGBA.fromInts(208, 208, 208),
    subdued: RGBA.fromInts(128, 128, 128),
  },
} as const;

const mountHint = async (options: {
  enabled?: boolean;
  mode?: "normal" | "shell";
  sessionID?: string | null;
  initialStatus?: SessionStatus;
}) => {
  const sessionID =
    "sessionID" in options ? (options.sessionID ?? undefined) : "ses_1";
  const [status, setStatus] = createSignal<SessionStatus>(
    options.initialStatus ?? "idle"
  );
  const handlers = new Map<FiredEvent, Set<() => void>>();
  const data: ForceHintData = {
    on: (type, handler) => {
      const listeners = handlers.get(type) ?? new Set<() => void>();
      listeners.add(handler);
      handlers.set(type, listeners);
      return () => listeners.delete(handler);
    },
    session: {
      status: () => status(),
    },
  };
  const setup = await testRender(
    () => (
      <box flexDirection="column" height={3} width={70}>
        <box height={1}>
          <text>composer info row</text>
        </box>
        <box height={1}>
          <text>border row</text>
        </box>
        <box flexDirection="row" height={1} width="100%">
          <ForceHint
            data={data}
            enabled={options.enabled ?? true}
            mode={options.mode ?? "normal"}
            sessionID={sessionID}
            theme={v2Theme}
          />
        </box>
      </box>
    ),
    { height: 3, width: 70 }
  );
  await setup.flush();
  /**
   * Emits a host event: the fake applies the real session-status transition
   * and then notifies subscribers. The transition only runs when the event
   * reaches a subscriber, so broken or misnamed `SESSION_EXECUTION_EVENTS`
   * wiring cannot change the UI on its own.
   */
  const fire = (type: FiredEvent): void => {
    const listeners = handlers.get(type);
    if (!listeners?.size) {
      return;
    }
    if (type === "session.execution.started") {
      setStatus("running");
    } else if (type !== "session.retry.scheduled") {
      setStatus("idle");
    }
    for (const listener of listeners) {
      listener();
    }
  };
  return { fire, setup };
};

const mounted: TestRendererSetup[] = [];

const infoRow = (setup: TestRendererSetup): string | undefined =>
  setup
    .captureCharFrame()
    .split("\n")
    .find((line) => line.includes("composer info"));

afterEach(() => {
  for (const setup of mounted.splice(0)) {
    setup.renderer.destroy();
  }
});

describe("hint options and colors", () => {
  test("defaults on and can be disabled", () => {
    expect(hintEnabled({})).toBe(true);
    expect(hintEnabled({ hint: true })).toBe(true);
    expect(hintEnabled({ hint: false })).toBe(false);
  });

  test("resolves structured and legacy theme colors", () => {
    const structured = resolveHintColors(v2Theme);
    expect(structured.key).toBe(v2Theme.text.default);
    expect(structured.label).toBe(v2Theme.text.subdued);
    expect(structured.force).toBe(v2Theme.text.action.primary.default);

    const legacy = {
      text: RGBA.fromInts(1, 2, 3),
      textMuted: RGBA.fromInts(4, 5, 6),
      warning: RGBA.fromInts(7, 8, 9),
    };
    const flat = resolveHintColors(legacy);
    expect(flat.key).toBe(legacy.text);
    expect(flat.label).toBe(legacy.textMuted);
    expect(flat.force).toBe(legacy.warning);

    const bareColor = RGBA.fromInts(9, 9, 9);
    const bare = resolveHintColors({ text: bareColor });
    expect(bare.key).toBe(bareColor);
    expect(bare.label).toBe(bareColor);
    expect(bare.force).toBe(bareColor);
  });
});

describe("hint rendering", () => {
  test("shows the idle send hint on the composer info row", async () => {
    const { setup } = await mountHint({});
    mounted.push(setup);
    const frame = setup.captureCharFrame();
    expect(infoRow(setup)).toContain("⏎ send");
    expect(frame).not.toContain("steer");
  });

  test("drives steer and idle from the execution events", async () => {
    const { fire, setup } = await mountHint({});
    mounted.push(setup);

    fire("session.execution.started");
    await setup.flush();
    expect(infoRow(setup)).toContain("steer");
    expect(infoRow(setup)).toContain("ctrl+⏎");
    expect(infoRow(setup)).toContain("interrupt & send");
    expect(setup.captureCharFrame()).not.toContain("⏎ send");

    // A retry is still part of the active run, so the hint stays on steer.
    fire("session.retry.scheduled");
    await setup.flush();
    expect(infoRow(setup)).toContain("steer");

    fire("session.execution.succeeded");
    await setup.flush();
    expect(infoRow(setup)).toContain("⏎ send");
    expect(setup.captureCharFrame()).not.toContain("steer");
  });

  const expectIdleAfterExecutionEvent = async (
    event: "session.execution.failed" | "session.execution.interrupted"
  ): Promise<void> => {
    const { fire, setup } = await mountHint({});
    mounted.push(setup);
    fire("session.execution.started");
    await setup.flush();
    expect(infoRow(setup)).toContain("steer");
    fire(event);
    await setup.flush();
    expect(infoRow(setup)).toContain("⏎ send");
  };

  test("returns to idle after failed and interrupted runs", async () => {
    await expectIdleAfterExecutionEvent("session.execution.failed");
    await expectIdleAfterExecutionEvent("session.execution.interrupted");
  });

  test("hides in shell mode, without a session, and when disabled", async () => {
    const shell = await mountHint({ mode: "shell" });
    mounted.push(shell.setup);
    expect(shell.setup.captureCharFrame()).not.toContain("send");

    const disabled = await mountHint({ enabled: false });
    mounted.push(disabled.setup);
    expect(disabled.setup.captureCharFrame()).not.toContain("send");

    const noSession = await mountHint({ sessionID: null });
    mounted.push(noSession.setup);
    expect(noSession.setup.captureCharFrame()).not.toContain("send");
  });
});
