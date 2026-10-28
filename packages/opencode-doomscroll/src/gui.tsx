import {
  Command,
  Plugin,
  SettingsPage,
  createKeyed,
} from "@opencode/plugin/gui";
import { Browser } from "@opencode/plugin/gui/browser";
import { createSignal } from "solid-js";

import { BrowserPane } from "./reels-ipc";
import type { BrowserPaneEvent, BrowserTab } from "./reels-ipc";

const REELS_URL = "https://www.instagram.com/reels/";
const OPEN_REELS_KEY = "command.openReels";
const CLOSE_FAILED_KEY = "toast.closeFailed";
const TOAST_ERROR = "error" as const;
const START_EVENTS = ["session.execution.started"] as const;

const STOP_EVENTS = [
  "session.execution.succeeded",
  "session.execution.failed",
  "session.execution.interrupted",
] as const;

interface ReelsTab {
  readonly binding: string;
  readonly tabID: string;
}

interface PendingOpen {
  candidateTabID?: string;
  readonly marker: string;
  closeRequested: boolean;
}

const matchesTab = (
  tab: BrowserTab,
  previous: ReadonlyMap<string, string> | undefined,
  request: PendingOpen,
  focusedTabID: string | null
): boolean => {
  if (request.candidateTabID === tab.id) {
    return true;
  }

  const isNewTab = previous !== undefined && !previous.has(tab.id);
  const hasMarker = tab.url.includes(request.marker);
  // Browser.open selects the new tab. Match its ID even if the first state is
  // blank or a redirect has already changed its URL.
  const isNewFocusedTab = isNewTab && tab.id === focusedTabID;

  if (!hasMarker && !isNewTab) {
    return false;
  }

  if (hasMarker || isNewFocusedTab) {
    request.candidateTabID = tab.id;

    return true;
  }

  return false;
};

export default Plugin.define({
  i18n: {
    en: {
      "command.openReels": "Open Instagram Reels",
      "settings.autoOpen": "Open Reels when a session starts",
      "settings.autoOpenDescription":
        "Pause or resume automatic Reels opening for this window.",
      "settings.description":
        "Reels open in OpenCode's browser and the tab closes when the session run ends.",
      "settings.title": "Doomscroll",
      "toast.closeFailed": "Could not close the Doomscroll tab",
      "toast.closeUnconfirmed":
        "OpenCode accepted the close request, but the browser still reports this tab as open.",
      "toast.openFailed": "Could not open the Doomscroll tab",
    },
  },
  os: ["macos", "windows", "linux"],
  setup(ctx) {
    const [autoOpen, setAutoOpen] = createSignal(
      ctx.options.autoOpen !== false
    );

    const browser = ctx.use(Browser);
    const browserPane = ctx.use(BrowserPane);
    const pending = new Map<string, PendingOpen>();
    const tabs = new Map<string, ReelsTab>();
    const states = new Map<string, ReadonlyMap<string, string>>();

    const findSession = (sessionID: string) =>
      ctx.sessions
        .list()
        .find(
          (session) =>
            session.id === sessionID && session.server.id === "sidecar"
        );

    const closeTab = async (
      sessionKey: string,
      reelsTab: ReelsTab
    ): Promise<void> => {
      const live = browserPane();

      if (live.status !== "active") {
        tabs.set(sessionKey, reelsTab);
        ctx.toast.show({
          description:
            "OpenCode's browser connection is unavailable, so the Reels tab may still be open.",
          title: ctx.t(CLOSE_FAILED_KEY),
          variant: TOAST_ERROR,
        });

        return;
      }

      try {
        await live.value.command({
          binding: reelsTab.binding,
          command: { tabID: reelsTab.tabID, type: "tabs.close" },
        });
        setTimeout(() => {
          if (tabs.get(sessionKey) !== reelsTab) {
            return;
          }

          ctx.toast.show({
            description: ctx.t("toast.closeUnconfirmed"),
            title: ctx.t(CLOSE_FAILED_KEY),
            variant: TOAST_ERROR,
          });
        }, 1500);
      } catch (error: unknown) {
        const failure =
          error instanceof Error ? error : new Error(String(error));

        ctx.toast.show({
          description: failure.message,
          title: ctx.t(CLOSE_FAILED_KEY),
          variant: TOAST_ERROR,
        });
      }
    };

    const onBrowserEvent = (value: BrowserPaneEvent): void => {
      const { binding, event } = value;

      if (event.type !== "state") {
        return;
      }

      const { state } = event;

      if (!state) {
        return;
      }

      const { tabs: browserTabs } = state;
      const previous = states.get(binding);
      states.set(binding, new Map(browserTabs.map((tab) => [tab.id, tab.url])));

      for (const [sessionKey, reelsTab] of tabs) {
        if (reelsTab.binding !== binding) {
          continue;
        }

        if (!browserTabs.some((tab) => tab.id === reelsTab.tabID)) {
          tabs.delete(sessionKey);
        }
      }

      for (const [sessionKey, request] of pending) {
        const opened = browserTabs.find((tab) =>
          matchesTab(tab, previous, request, state.focusedTabID)
        );

        if (opened) {
          pending.delete(sessionKey);
          const reelsTab = { binding, tabID: opened.id };
          tabs.set(sessionKey, reelsTab);

          if (request.closeRequested) {
            void closeTab(sessionKey, reelsTab);
          }

          return;
        }
      }
    };

    const openReels = (
      session: NonNullable<ReturnType<typeof findSession>>
    ): void => {
      const live = browser();

      if (live.status !== "active") {
        ctx.toast.show({
          description:
            "OpenCode's browser is unavailable for this session. Open the session in Desktop and try again.",
          title: ctx.t("toast.openFailed"),
          variant: TOAST_ERROR,
        });

        return;
      }

      if (pending.has(session.key) || tabs.has(session.key)) {
        return;
      }

      const marker = `__doomscroll=${crypto.randomUUID()}`;
      pending.set(session.key, { closeRequested: false, marker });

      try {
        live.value.open(session, `${REELS_URL}?${marker}`);
      } catch (error: unknown) {
        pending.delete(session.key);

        const failure =
          error instanceof Error ? error : new Error(String(error));

        ctx.toast.show({
          description: failure.message,
          title: ctx.t("toast.openFailed"),
          variant: TOAST_ERROR,
        });
      }
    };

    const closeReels = (
      session: NonNullable<ReturnType<typeof findSession>>
    ): void => {
      const request = pending.get(session.key);

      if (request) {
        request.closeRequested = true;
      }

      const reelsTab = tabs.get(session.key);

      if (reelsTab) {
        void closeTab(session.key, reelsTab);
      }
    };

    ctx.add(Command, (): Command => ({
      enabled: ctx.app.platform === "desktop" && !!ctx.sessions.current(),
      id: "open-reels",
      keywords: "instagram reels doomscroll break",
      run: () => {
        const session = ctx.sessions.current();

        if (session) {
          openReels(session);
        }
      },
      section: "session",
      title: ctx.t(OPEN_REELS_KEY),
    }));

    ctx.add(SettingsPage, {
      icon: "globe",
      id: "preferences",
      render: () => (
        <section>
          <ctx.ui.Switch
            checked={autoOpen()}
            onChange={setAutoOpen}
            label={ctx.t("settings.autoOpen")}
            description={ctx.t("settings.autoOpenDescription")}
          />
          <p>{ctx.t("settings.description")}</p>
        </section>
      ),
      get title() {
        return ctx.t("settings.title");
      },
    });

    createKeyed(browserPane, (live) => live.on("event", onBrowserEvent));

    createKeyed(
      () => ctx.servers.get("sidecar")?.data,
      (data) => {
        const subscriptions = [
          ...START_EVENTS.map((type) =>
            data.on(type, (event) => {
              if (!autoOpen()) {
                return;
              }

              const session = findSession(event.data.sessionID);

              if (session) {
                openReels(session);
              }
            })
          ),
          ...STOP_EVENTS.map((type) =>
            data.on(type, (event) => {
              const session = findSession(event.data.sessionID);

              if (session) {
                closeReels(session);
              }
            })
          ),
        ];

        return () => {
          for (const unsubscribe of subscriptions) {
            unsubscribe();
          }
        };
      }
    );
  },
});
