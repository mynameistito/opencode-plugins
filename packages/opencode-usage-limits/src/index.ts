import { Plugin } from "@opencode/plugin/tui";

import { setupUsageLimitsPlugin } from "@/plugin.tsx";

export default Plugin.define({
  id: "mynameistito.usage-limits",
  setup: setupUsageLimitsPlugin,
});
