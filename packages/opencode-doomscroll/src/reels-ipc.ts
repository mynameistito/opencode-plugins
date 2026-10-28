import { Ipc } from "@opencode/plugin/gui";
import { Schema } from "effect";

const BrowserTabSchema = Schema.Struct({
  canGoBack: Schema.Boolean,
  canGoForward: Schema.Boolean,
  generation: Schema.Number,
  id: Schema.String,
  loadError: Schema.optional(Schema.String),
  loading: Schema.Boolean,
  title: Schema.String,
  url: Schema.String,
});

export type BrowserTab = typeof BrowserTabSchema.Type;

const BrowserState = Schema.Struct({
  focusedTabID: Schema.NullOr(Schema.String),
  tabs: Schema.Array(BrowserTabSchema),
});

const PaneElementSchema = Schema.Struct({
  label: Schema.String,
  name: Schema.optional(Schema.String),
  rect: Schema.Struct({
    height: Schema.Number,
    width: Schema.Number,
    x: Schema.Number,
    y: Schema.Number,
  }),
  ref: Schema.String,
  role: Schema.optional(Schema.String),
  selector: Schema.String,
  text: Schema.optional(Schema.String),
});

const PaneEvent = Schema.Union([
  Schema.Struct({ tabID: Schema.String, type: Schema.Literal("focus") }),
  Schema.Struct({
    embed: Schema.String,
    tabID: Schema.String,
    type: Schema.Literal("embed"),
  }),
  Schema.Struct({
    active: Schema.Boolean,
    element: Schema.optional(PaneElementSchema),
    tabID: Schema.String,
    type: Schema.Literal("inspect"),
  }),
  Schema.Struct({
    icon: Schema.optional(Schema.String),
    tabID: Schema.String,
    type: Schema.Literal("page"),
    zoom: Schema.Number,
  }),
  Schema.Struct({ path: Schema.String, type: Schema.Literal("preview") }),
  Schema.Struct({
    alt: Schema.Boolean,
    code: Schema.String,
    ctrl: Schema.Boolean,
    key: Schema.String,
    meta: Schema.Boolean,
    shift: Schema.Boolean,
    type: Schema.Literal("shortcut"),
  }),
  Schema.Struct({ tabID: Schema.String, type: Schema.Literal("focused") }),
  Schema.Struct({
    error: Schema.optional(Schema.String),
    state: Schema.NullOr(BrowserState),
    type: Schema.Literal("state"),
  }),
]);

const BrowserPaneEventSchema = Schema.Struct({
  binding: Schema.String,
  event: PaneEvent,
});

export type BrowserPaneEvent = typeof BrowserPaneEventSchema.Type;

const binding = Schema.String;
const tabID = Schema.String;
const BrowserAction = Schema.Unknown;

// This mirrors the built-in Browser pane IPC. Keep the full method surface here:
// both plugins resolve the same IPC ID, and the Browser plugin needs register()
// before it can attach a session's pane.
export const BrowserPane = Ipc.define({
  events: { event: BrowserPaneEventSchema },
  id: "browser.pane",
  methods: {
    clearSite: { input: Schema.Struct({ binding, tabID }) },
    close: { input: Schema.Struct({ binding }) },
    command: {
      input: Schema.Struct({
        binding,
        command: BrowserAction,
      }),
    },
    highlight: {
      input: Schema.Struct({
        binding,
        ref: Schema.optional(Schema.String),
        tabID,
      }),
    },
    inspect: {
      input: Schema.Struct({ binding, enabled: Schema.Boolean, tabID }),
    },
    load: { input: Schema.Struct({ binding, tabID }) },
    register: {
      input: Schema.Struct({
        binding,
        restore: Schema.optional(BrowserState),
        server: Schema.String,
        session: Schema.String,
      }),
    },
    site: {
      input: Schema.Struct({ binding, tabID }),
      output: Schema.Struct({ cookies: Schema.Int }),
    },
    zoom: {
      input: Schema.Struct({
        binding,
        tabID,
        zoom: Schema.Literals(["in", "out", "reset"]),
      }),
    },
  },
});
