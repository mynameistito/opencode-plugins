import { describe, expect, test } from "bun:test";

import type { KeymapLayer, SlotClaim } from "@opencode-ai/plugin/tui/context";

import { forceSubmit, registerForceSubmitLayer, setup } from "../src/index";
import type { ForceSubmitContext } from "../src/index";

describe("force submit", () => {
  test("interrupts three times before submitting", () => {
    const commands: string[] = [];

    forceSubmit((command) => commands.push(command));

    expect(commands).toEqual([
      "session.interrupt",
      "session.interrupt",
      "session.interrupt",
      "prompt.submit",
    ]);
  });

  test("registers both terminal Ctrl+Enter bindings", () => {
    const layers: (() => KeymapLayer)[] = [];
    const keymap = {
      dispatch: () => {},
      layer: (layer: () => KeymapLayer) => {
        layers.push(layer);
      },
    };

    registerForceSubmitLayer(keymap);

    const layer = layers[0]?.();
    const commands = layer?.commands ?? [];
    expect(layer?.mode).toBe("global");
    expect(layer?.bindings).toEqual([
      "oc-ctrl-enter.force-submit.return",
      "oc-ctrl-enter.force-submit.enter",
    ]);
    expect(commands.map((command) => command.bind)).toEqual([
      "ctrl+return",
      "ctrl+enter",
    ]);
  });

  test("registers one layer across prompt footer renders and dispatches force-submit", () => {
    const claims: SlotClaim[] = [];
    const layers: (() => KeymapLayer)[] = [];
    const dispatched: string[] = [];
    const context = {
      keymap: {
        dispatch: (command: string) => dispatched.push(command),
        layer: (layer: () => KeymapLayer) => layers.push(layer),
      },
      ui: {
        slot: (claim: SlotClaim) => {
          claims.push(claim);
          return () => {};
        },
      },
    } satisfies ForceSubmitContext;

    setup(context);

    const claim = claims.find(
      (candidate): candidate is SlotClaim<"prompt.footer.status"> =>
        candidate.append === "prompt.footer.status"
    );
    expect(claim).toBeDefined();
    claim?.render({ mode: "normal" });
    claim?.render({ mode: "normal" });

    expect(layers).toHaveLength(1);
    const [layer] = layers;
    if (!layer) {
      throw new Error("expected force-submit keymap layer");
    }
    const { commands } = layer();
    if (!commands) {
      throw new Error("expected force-submit keymap commands");
    }
    const [command] = commands;
    if (!command) {
      throw new Error("expected force-submit command");
    }
    command.run();

    expect(dispatched).toEqual([
      "session.interrupt",
      "session.interrupt",
      "session.interrupt",
      "prompt.submit",
    ]);
  });
});
