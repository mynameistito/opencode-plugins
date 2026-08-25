import { describe, expect, test } from "bun:test";

import type {
  Context,
  KeymapLayer,
  SlotClaim,
} from "@opencode-ai/plugin/tui/context";

import { forceSubmit, registerForceSubmitLayer, setup } from "../tui";

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

  test("mounts registration in the prompt footer", () => {
    const claims: SlotClaim[] = [];
    const context = {
      keymap: {
        dispatch: () => {},
        layer: () => {},
      },
      ui: {
        slot: (claim: SlotClaim) => {
          claims.push(claim);
          return () => {};
        },
      },
    } as unknown as Context;

    setup(context);

    expect(claims[0]?.append).toBe("prompt.footer.status");
  });
});
