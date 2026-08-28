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
}

const shareId = (): string => {
  const match = /^\/s\/(?<id>[A-Za-z0-9_-]{20,96})\/?$/u.exec(
    window.location.pathname
  );
  if (!match?.groups?.id) {
    throw new Error("not_found");
  }
  return match.groups.id;
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
  const parsed = parseTranscript(
    await decryptPayload(key, await response.json())
  );
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
    title: "Share unavailable",
  },
  unsupported: {
    body: "This transcript was exported by a newer viewer than this one.",
    title: "Unsupported transcript version",
  },
};

const Status = ({ state }: { readonly state: ViewState }) => {
  if (state.kind === "loading" || state.kind === "decrypting")
    {return (
      <section className="status-panel" aria-live="polite">
        <p className="terminal-line">
          <span className="prompt">$</span>{" "}
          {state.kind === "loading"
            ? "loading encrypted share"
            : "decrypting locally"}
          <span className="cursor">_</span>
        </p>
        <p className="status-muted">No plaintext or key leaves this browser.</p>
      </section>
    );}
  const copy = errorCopy[state.code ?? "malformed"] ?? {
    body: "The share could not be displayed.",
    title: "Share unavailable",
  };
  return (
    <section className="status-panel error-panel" role="alert">
      <p className="eyebrow">share unavailable</p>
      <h1>{copy.title}</h1>
      <p>{copy.body}</p>
      <p className="privacy-note">
        No key or plaintext was sent to the server.
      </p>
    </section>
  );
};

const TranscriptView = ({
  transcript,
}: {
  readonly transcript: Transcript;
}) => 
  (
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
          $ session contains no messages<span className="cursor">_</span>
        </section>
      ) : (
        <section className="message-list" aria-label="OpenCode transcript">
          {transcript.messages.map((message) => (
            <Message key={message.id} message={message} />
          ))}
        </section>
      )}
    </>
  )
;

const roleMark = (role: string): string => {
  if (role === "user") {return ">";}
  if (role === "assistant") {return "◆";}
  if (role === "system") {return "!";}
  return "·";
};

const Message = ({ message }: { readonly message: TranscriptMessage }) => {
  const label = message.role === "other" ? "unknown" : message.role;
  return (
    <article className={`message message-${message.role}`}>
      <div className="message-gutter">
        <span className="role-mark" aria-hidden="true">
          {roleMark(message.role)}
        </span>
        <span className="role-name">{label}</span>
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
};

const PlainText = ({
  text,
  className = "",
}: {
  readonly text: string;
  readonly className?: string;
}) => {
  const chunks = text.split(/(?<code>```[^\n]*\n[\s\S]*?```)/gu);
  return (
    <div className={`rich-text ${className}`}>
      {chunks.map((chunk, index) =>
        chunk.startsWith("```") ? (
          <pre className="code-block" key={index}>
            {chunk.replaceAll(/^```[^\n]*\n|```$/gu, "")}
          </pre>
        ) : (chunk ? (
          <p key={index}>{chunk}</p>
        ) : null)
      )}
    </div>
  );
};

const Part = ({ part }: { readonly part: TranscriptPart }) => {
  if (part.type === "text") {return <PlainText text={part.text} />;}
  if (part.type === "reasoning")
    {return (
      <details className="reasoning">
        <summary>thinking</summary>
        <PlainText text={part.text} />
      </details>
    );}
  if (part.type === "shell")
    {return (
      <details className="tool-block shell-block" open>
        <summary>
          <span className="tool-kind">shell</span>
          <strong>{part.command}</strong>
          <em>completed</em>
        </summary>
        <div className="tool-content">
          <pre className="command-block">
            <span className="prompt">$</span> {part.command}
          </pre>
          {part.output ? <pre>{part.output}</pre> : null}
        </div>
      </details>
    );}
  if (part.type === "tool")
    {return (
      <details className="tool-block">
        <summary>
          <span className="tool-kind">tool</span>
          <strong>{part.name}</strong>
          <em>
            {part.status}
            {part.duration && part.duration > 0 ? ` · ${part.duration}ms` : ""}
          </em>
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
    );}
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
};

const App = () => {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [dark, setDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);
  useEffect(() => {
    const load = async () => {
      setState({ kind: "decrypting" });
      try {
        setState({ kind: "ready", transcript: await loadShare() });
      } catch (error: unknown) {
        const code =
          error instanceof Error && errorCopy[error.message]
            ? error.message
            : "malformed";
        setState({ code, kind: "error" });
      }
    };
    void load();
  }, []);
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="/s/">
          opencode<span>/</span>share
        </a>
        <div className="topbar-actions">
          <span className="privacy-label">decrypted locally</span>
          <button
            className="theme-button"
            type="button"
            onClick={() => setDark((value) => !value)}
            aria-label="Toggle color theme"
          >
            theme: {dark ? "dark" : "light"}
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
};

const root = document.querySelector("#root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
