import { Plugin } from "@opencode-ai/plugin";

/** OpenCode v2 server plugin identifier. */
const PLUGIN_ID = "mynameistito.oc-ctrl-enter-force-import";

/** OpenCode v2 server entrypoint that enables the companion TUI plugin. */
export default Plugin.define({
  id: PLUGIN_ID,
  setup: () => Promise.resolve(),
  tui: true,
});
