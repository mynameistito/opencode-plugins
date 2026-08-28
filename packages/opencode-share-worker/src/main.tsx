// oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-unsafe-dictionary-type, anti-slop/no-known-value-widening, anti-slop/require-safety-comment-for-type-assertion, eslint(func-style), eslint(no-use-before-define), eslint(no-nested-ternary), github(no-then), promise(prefer-await-to-then), promise(prefer-await-to-callbacks), sonarjs(max-union-size), sonarjs(no-nested-conditional), unicorn(prefer-code-point), eslint(prefer-named-capture-group)
// oxlint-disable func-style, no-use-before-define, no-nested-ternary, no-then, prefer-await-to-callbacks, prefer-await-to-then, max-union-size, no-nested-conditional, prefer-code-point, prefer-named-capture-group
// oxlint-disable sonarjs/max-union-size, github/no-then, sonarjs/no-nested-conditional
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

import { decryptPayload } from "./decryption";
import { parseTranscript } from "./transcript";
import type {
  Transcript,
  TranscriptMessage,
  TranscriptPart,
} from "./transcript";

import "./styles.css";

interface ViewState {
  readonly kind: "loading" | "decrypting" | "ready" | "error";
  readonly transcript?: Transcript;
  readonly code?: string;
  readonly title?: string;
}

const shareId = (): string => {
  const match = /^\/s\/([A-Za-z0-9_-]{20,96})\/?$/u.exec(
    window.location.pathname
  );
  if (!match?.[1]) {
    throw new Error("not_found");
  }
  return match[1];
};

const loadShare = async (): Promise<Transcript> => {
  const key = window.location.hash.slice(1);
  if (!key) {
    throw new Error("missing_key");
  }
  if (!/^[A-Za-z0-9_-]+$/u.test(key)) {
    throw new Error("invalid_key");
  }
  const response = await fetch(`/api/shares/${encodeURIComponent(shareId())}`, {
    credentials: "same-origin",
  });
  if (response.status === 404) {
    throw new Error("not_found");
  }
  if (!response.ok) {
    throw new Error("network");
  }
  const payload: unknown = await response.json();
  const parsed = parseTranscript(await decryptPayload(key, payload));
  if (parsed === "unsupported") {
    throw new Error("unsupported");
  }
  if (parsed === "malformed") {
    throw new Error("malformed");
  }
  return parsed;
};

const errorCopy: Record<
  string,
  { readonly title: string; readonly body: string }
> = {
  decrypt_failure: {
    body: "The share key does not match this encrypted share.",
    title: "Unable to decrypt share",
  },
  invalid_encrypted_payload: {
    body: "The encrypted response is not a valid transcript payload.",
    title: "Invalid encrypted payload",
  },
  invalid_key: {
    body: "The share key is not a valid AES-GCM key.",
    title: "Malformed share key",
  },
  malformed: {
    body: "The decrypted transcript does not match a supported export format.",
    title: "Invalid transcript",
  },
  missing_key: {
    body: "This share needs the key after the # in its URL. Ask the sender for the complete link.",
    title: "Missing share key",
  },
  network: {
    body: "The encrypted share could not be loaded. Check your connection and try again.",
    title: "Network failure",
  },
  not_found: {
    body: "This share may be expired, deleted, or unavailable.",
    title: "Share not found",
  },
  unsupported: {
    body: "This transcript was exported by a newer viewer than this one.",
    title: "Unsupported transcript version",
  },
};

function App() {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [dark, setDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    setState({ kind: "decrypting" });
    loadShare()
      .then((transcript) => setState({ kind: "ready", transcript }))
      .catch((error: unknown) => {
        const code =
          error instanceof Error && errorCopy[error.message]
            ? error.message
            : "malformed";
        setState({ code, kind: "error", title: errorCopy[code]?.title });
      });
  }, []);
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="/s/">
          oc<span>/</span>share
        </a>
        <div className="topbar-actions">
          <span className="privacy-label">decrypted locally</span>
          <button
            className="theme-button"
            type="button"
            onClick={() => setDark((value) => !value)}
            aria-label="Toggle color theme"
          >
            {dark ? "light" : "dark"}
          </button>
        </div>
      </header>
      <main className="main-content">
        {state.kind === "ready" && state.transcript ? (
          <TranscriptView transcript={state.transcript} />
        ) : (
          <Status state={state} />
        )}
      </main>
    </div>
  );
}

function Status({ state }: { readonly state: ViewState }) {
  if (state.kind === "loading" || state.kind === "decrypting") {
    return (
      <section className="status-panel" aria-live="polite">
        <div className="skeleton-line" />
        <div className="skeleton-line short" />
        <p>
          {state.kind === "loading"
            ? "Loading encrypted share"
            : "Decrypting in this browser"}
          <span className="cursor">_</span>
        </p>
      </section>
    );
  }
  const copy = errorCopy[state.code ?? "malformed"] ?? {
    body: "The share could not be displayed.",
    title: "Share unavailable",
  };
  return (
    <section className="status-panel error-panel" role="alert">
      <p className="eyebrow">share unavailable</p>
      <h1>{state.title ?? copy.title}</h1>
      <p>{copy.body}</p>
      <p className="privacy-note">
        No key or plaintext was sent to the server.
      </p>
    </section>
  );
}

function TranscriptView({ transcript }: { readonly transcript: Transcript }) {
  return (
    <>
      <section className="transcript-heading">
        <div>
          <p className="eyebrow">opencode session</p>
          <h1>Transcript</h1>
        </div>
        <div className="transcript-meta">
          <span>{transcript.messages.length} messages</span>
          <span>client decrypted</span>
        </div>
      </section>
      {transcript.messages.length === 0 ? (
        <section className="empty-state">
          This session contains no messages.
        </section>
      ) : (
        <section className="message-list" aria-label="OpenCode transcript">
          {transcript.messages.map((message) => (
            <Message key={message.id} message={message} />
          ))}
        </section>
      )}
    </>
  );
}

function Message({ message }: { readonly message: TranscriptMessage }) {
  const { role } = message;
  return (
    <article className={`message message-${role}`}>
      <div className="message-gutter">
        <span className="role-mark" aria-hidden="true">
          {role === "user"
            ? ">"
            : role === "assistant"
              ? "◆"
              : role === "system"
                ? "!"
                : "·"}
        </span>
        <span className="role-name">{role}</span>
      </div>
      <div className="message-body">
        <div className="message-info">
          {message.model ? <span>{message.model}</span> : null}
          {message.timestamp ? (
            <time dateTime={new Date(message.timestamp).toISOString()}>
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </time>
          ) : null}
        </div>
        {message.parts.map((part, index) => (
          <Part key={`${message.id}-${index}`} part={part} />
        ))}
      </div>
    </article>
  );
}

function Part({ part }: { readonly part: TranscriptPart }) {
  if (part.type === "text") {
    return <p className="message-text">{part.text}</p>;
  }
  if (part.type === "reasoning") {
    return (
      <details className="reasoning">
        <summary>reasoning</summary>
        <pre>{part.text}</pre>
      </details>
    );
  }
  if (part.type === "tool") {
    return (
      <details className="tool-block">
        <summary>
          <span>tool</span>
          <strong>{part.name}</strong>
          <em>{part.status}</em>
        </summary>
        <div className="tool-content">
          <label>input</label>
          <pre>{part.input}</pre>
          {part.output ? (
            <>
              <label>output</label>
              <pre>{part.output}</pre>
            </>
          ) : null}
        </div>
      </details>
    );
  }
  if (part.type === "file") {
    return (
      <div className="file-part">
        <span>file</span>
        <code>{part.name}</code>
        <small>{part.detail}</small>
      </div>
    );
  }
  return (
    <details className="fallback">
      <summary>unrecognized part: {part.label}</summary>
      <pre>{part.detail}</pre>
    </details>
  );
}

const root = document.querySelector("#root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
