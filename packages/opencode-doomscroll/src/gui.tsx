import {
  Command,
  Plugin,
  SettingsPage,
  createKeyed,
} from "@opencode/plugin/gui";
import { Browser } from "@opencode/plugin/gui/browser";
import { createSignal } from "solid-js";

import { BrowserPane } from "./doomscroll-ipc";
import type { BrowserPaneEvent, BrowserTab } from "./doomscroll-ipc";

const X_HOME_URL = "https://x.com/home";
const OPEN_X_KEY = "command.openX";
const CLOSE_FAILED_KEY = "toast.closeFailed";
const OPEN_FAILED_KEY = "toast.openFailed";
const TOAST_ERROR = "error" as const;
const START_EVENTS = ["session.execution.started"] as const;

const STOP_EVENTS = [
  "session.execution.succeeded",
  "session.execution.failed",
  "session.execution.interrupted",
] as const;

interface DoomscrollTab {
  readonly binding: string;
  readonly tabID: string;
}

interface PendingOpen {
  closeRequested: boolean;
}

const matchesTab = (
  tab: BrowserTab,
  previous: ReadonlyMap<string, string> | undefined,
  focusedTabID: string | null,
  allowFocusFallback: boolean
): boolean =>
  allowFocusFallback &&
  previous !== undefined &&
  !previous.has(tab.id) &&
  tab.id === focusedTabID;

export default Plugin.define({
  i18n: {
    en: {
      "command.openX": "Open X",
      "settings.autoOpen": "Open X when a session starts",
      "settings.autoOpenDescription":
        "Pause or resume automatic X opening for this window.",
      "settings.description":
        "X opens in OpenCode's browser and the tab closes when the session run ends.",
      "settings.title": "Doomscroll",
      "toast.browserUnavailable":
        "The built-in Browser plugin is off or unavailable. Enable it in Extensions, then try again.",
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
    const tabs = new Map<string, DoomscrollTab>();
    const states = new Map<string, ReadonlyMap<string, string>>();

    const findSession = (sessionID: string) =>
      ctx.sessions
        .list()
        .find(
          (session) =>
            session.id === sessionID && session.server.id === "sidecar"
        );

    const findTopLevelSession = async (sessionID: string) => {
      const session = findSession(sessionID);

      if (!session) {
        return null;
      }

      try {
        const info = await session.server.client.session.get({ sessionID });

        if (info.parentID && !info.fork) {
          return null;
        }
      } catch {
        // The desktop's shell session reference is the fallback if the server
        // cannot provide session metadata during a connection transition.
      }

      return session;
    };

    const queuedOpen = new Map<
      string,
      NonNullable<ReturnType<typeof findSession>>
    >();

    const closeTab = async (
      sessionKey: string,
      doomscrollTab: DoomscrollTab
    ): Promise<void> => {
      const live = browserPane();

      if (live.status !== "active") {
        tabs.set(sessionKey, doomscrollTab);
        ctx.toast.show({
          description:
            "OpenCode's browser connection is unavailable, so the X tab may still be open.",
          title: ctx.t(CLOSE_FAILED_KEY),
          variant: TOAST_ERROR,
        });

        return;
      }

      try {
        await live.value.command({
          binding: doomscrollTab.binding,
          command: { tabID: doomscrollTab.tabID, type: "tabs.close" },
        });
        setTimeout(() => {
          if (tabs.get(sessionKey) !== doomscrollTab) {
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

      for (const [sessionKey, doomscrollTab] of tabs) {
        if (doomscrollTab.binding !== binding) {
          continue;
        }

        if (!browserTabs.some((tab) => tab.id === doomscrollTab.tabID)) {
          tabs.delete(sessionKey);
        }
      }

      for (const [sessionKey, request] of pending) {
        const opened = browserTabs.find((tab) =>
          matchesTab(tab, previous, state.focusedTabID, pending.size === 1)
        );

        if (opened) {
          pending.delete(sessionKey);
          const doomscrollTab = { binding, tabID: opened.id };
          tabs.set(sessionKey, doomscrollTab);

          if (request.closeRequested) {
            void closeTab(sessionKey, doomscrollTab);
          }

          return;
        }
      }
    };

    const openX = (
      session: NonNullable<ReturnType<typeof findSession>>
    ): void => {
      if (
        queuedOpen.has(session.key) ||
        pending.has(session.key) ||
        tabs.has(session.key)
      ) {
        return;
      }

      const live = browser();

      if (live.status === "pending") {
        queuedOpen.set(session.key, session);

        return;
      }

      if (live.status !== "active") {
        ctx.toast.show({
          description: ctx.t("toast.browserUnavailable"),
          title: ctx.t(OPEN_FAILED_KEY),
          variant: TOAST_ERROR,
        });

        return;
      }

      queuedOpen.delete(session.key);
      pending.set(session.key, { closeRequested: false });

      try {
        live.value.open(session, X_HOME_URL);
      } catch (error: unknown) {
        pending.delete(session.key);

        const failure =
          error instanceof Error ? error : new Error(String(error));

        ctx.toast.show({
          description: failure.message,
          title: ctx.t(OPEN_FAILED_KEY),
          variant: TOAST_ERROR,
        });
      }
    };

    const closeX = (
      session: NonNullable<ReturnType<typeof findSession>>
    ): void => {
      const request = pending.get(session.key);
      queuedOpen.delete(session.key);

      if (request) {
        request.closeRequested = true;
      }

      const doomscrollTab = tabs.get(session.key);

      if (doomscrollTab) {
        void closeTab(session.key, doomscrollTab);
      }
    };

    ctx.add(Command, (): Command => ({
      enabled: ctx.app.platform === "desktop" && !!ctx.sessions.current(),
      id: "open-x",
      keywords: "x twitter doomscroll break",
      run: () => {
        const session = ctx.sessions.current();

        if (session) {
          openX(session);
        }
      },
      section: "session",
      title: ctx.t(OPEN_X_KEY),
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
      browser,
      () => {
        const sessions = [...queuedOpen.values()];
        queuedOpen.clear();

        for (const session of sessions) {
          openX(session);
        }
      },
      {
        otherwise: () => {
          if (browser().status !== "inactive" || queuedOpen.size === 0) {
            return;
          }

          ctx.toast.show({
            description: ctx.t("toast.browserUnavailable"),
            title: ctx.t(OPEN_FAILED_KEY),
            variant: TOAST_ERROR,
          });
          queuedOpen.clear();
        },
      }
    );

    createKeyed(
      () => ctx.servers.get("sidecar")?.data,
      (data) => {
        const subscriptions = [
          ...START_EVENTS.map((type) =>
            data.on(type, async (event) => {
              if (!autoOpen()) {
                return;
              }

              const session = await findTopLevelSession(event.data.sessionID);

              if (session) {
                openX(session);
              }
            })
          ),
          ...STOP_EVENTS.map((type) =>
            data.on(type, async (event) => {
              const session = await findTopLevelSession(event.data.sessionID);

              if (session) {
                closeX(session);
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
