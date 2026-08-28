/* @jsxImportSource @opentui/solid */
import { Plugin } from "@opencode-ai/plugin/tui";
import type { Context, KeymapLayer } from "@opencode-ai/plugin/tui/context";

import { resolveConfig } from "./src/config.ts";
import { encrypt } from "./src/crypto.ts";
import { expiryAt } from "./src/expiry.ts";
import { serializeSession } from "./src/export.ts";
import { parseCreateResponse } from "./src/protocol.ts";
import { shareUrl } from "./src/url.ts";

const PLUGIN_ID = "mynameistito.opencode-share";
const COMMAND_ID = "opencode-share.create";
const MAX_WORKER_REQUEST_BYTES = 5_242_880;
const UPLOAD_TIMEOUT_MS = 30_000;
interface SessionSlot {
  readonly sessionID?: string;
}

const showError = (context: Context, message: string): void =>
  context.ui.toast.show({
    message,
    title: "Share",
    variant: "error",
  });

const copyClipboard = (value: string): void => {
  const encoded = Buffer.from(value).toString("base64");
  process.stdout.write(`\u001B]52;c;${encoded}\u0007`);
};

const runShare = async (context: Context, sessionID: string): Promise<void> => {
  const config = resolveConfig(context.options);
  if (!config.endpoint) {
    return showError(context, "Configure endpoint in cli.json.");
  }
  const token = process.env[config.tokenEnv];
  if (!token) {
    return showError(context, `Missing ${config.tokenEnv}.`);
  }
  const expiresAt = expiryAt(config.defaultExpiry);
  if (expiresAt === undefined) {
    return showError(context, "Invalid defaultExpiry; use 1m-31d.");
  }
  const plaintext = serializeSession(
    context.data.session.message.list(sessionID),
    config.sanitize
  );
  if (new TextEncoder().encode(plaintext).byteLength > config.maxPayloadBytes) {
    return showError(context, "Session export exceeds maxPayloadBytes.");
  }
  const encrypted = await encrypt(plaintext);
  const body = JSON.stringify({
    expiresAt,
    id: crypto.randomUUID(),
    payload: encrypted.payload,
  });
  if (new TextEncoder().encode(body).byteLength > MAX_WORKER_REQUEST_BYTES) {
    return showError(context, "Session export exceeds Worker request limit.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${config.endpoint}/api/shares`, {
      body,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    return showError(context, "Worker upload failed.");
  }
  const parsed = parseCreateResponse(await response.json());
  if (!parsed) {
    return showError(context, "Worker returned an invalid response.");
  }
  copyClipboard(shareUrl(config.endpoint, parsed.id, encrypted.key));
  context.ui.toast.show({
    message: "Encrypted share URL copied to clipboard.",
    title: "Share",
    variant: "success",
  });
};

const setup = (context: Context): (() => void) => {
  let sessionID: string | undefined;
  const dispose = context.ui.slot({
    append: "prompt.footer.status",
    render: ({ sessionID: currentSessionID }: SessionSlot) => {
      sessionID = currentSessionID;
      return <></>;
    },
  });
  context.keymap.layer((): KeymapLayer => ({
    bindings: [COMMAND_ID],
    commands: [
      {
        bind: "<leader>h",
        description: "Encrypt and upload the current session",
        group: "Session",
        id: COMMAND_ID,
        palette: true,
        run: async () => {
          if (sessionID) {
            try {
              await runShare(context, sessionID);
            } catch {
              showError(context, "Session sharing failed.");
            }
          } else {
            context.ui.toast.show({
              message: "No active session.",
              title: "Share",
              variant: "error",
            });
          }
        },
        slash: { name: "share" },
        title: "Share encrypted session",
      },
    ],
    mode: "global",
  }));
  return dispose;
};

/** OpenCode V2 TUI plugin entrypoint. */
export default Plugin.define({ id: PLUGIN_ID, setup });
/** Exported setup for package consumers and tests. */
export { setup };
