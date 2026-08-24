import { Plugin } from "@opencode-ai/plugin/tui";
import type { Context } from "@opencode-ai/plugin/tui/context";

/** OpenCode v2 plugin identifier. */
const PLUGIN_ID = "mynameistito.oc-ctrl-enter-force-import";

/** OpenCode command registered by this plugin for Ctrl+Enter force-submit. */
const FORCE_SUBMIT_COMMAND = "oc-ctrl-enter.force-submit";

/** Key sequences commonly emitted for Ctrl+Enter across terminal environments. */
const FORCE_SUBMIT_COMMANDS = [
  { bind: "ctrl+return", id: `${FORCE_SUBMIT_COMMAND}.return` },
  { bind: "ctrl+enter", id: `${FORCE_SUBMIT_COMMAND}.enter` },
] as const;

type ForceSubmitKeymap = Pick<Context["keymap"], "dispatch" | "layer">;

/** Dispatches OpenCode's guarded interrupt flow before submitting the prompt. */
export const forceSubmit = (dispatch: (command: string) => void): void => {
  dispatch("session.interrupt");
  dispatch("session.interrupt");
  dispatch("session.interrupt");
  dispatch("prompt.submit");
};

/**
 * Registers the v2 keymap layer for force-submit.
 *
 * @param context - The v2 plugin context supplied by OpenCode.
 */
/** Registers the force-submit commands on a v2 keymap. */
export const registerForceSubmitLayer = (keymap: ForceSubmitKeymap): void => {
  keymap.layer(() => ({
    commands: FORCE_SUBMIT_COMMANDS.map(({ bind, id }) => ({
      bind,
      group: "Prompt",
      id,
      run: () => forceSubmit((command) => keymap.dispatch(command)),
      title: "Force submit prompt",
    })),
    priority: 1000,
  }));
};

/** Initializes the OpenCode v2 TUI plugin. */
export const setup = (context: Context): void => {
  registerForceSubmitLayer(context.keymap);
};

/** OpenCode v2 plugin module entrypoint. */
export default Plugin.define({
  id: PLUGIN_ID,
  setup,
});
