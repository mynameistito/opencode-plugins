import { StrictMode, useEffect, useState } from "react";
import type { ReactNode } from "react";
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
  if (state.kind === "loading" || state.kind === "decrypting") {
    return (
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
    );
  }
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
}) => (
  <div className="share-viewer">
    <header className="share-header">
      <h1>{transcript.title ?? "OpenCode session"}</h1>
      <div className="header-details">
        <ul className="header-stats">
          <li><span className="header-icon opencode-icon" aria-hidden="true" /> <span>v{transcript.version}</span></li>
          {transcript.provider || transcript.model ? <li><span className="header-icon model-icon" aria-hidden="true" /> <span>{[transcript.provider, transcript.model].filter(Boolean).join(" /")}</span></li> : null}
        </ul>
        {transcript.provider || transcript.model ? (
          <span className="header-label">OpenCode session</span>
        ) : null}
        {transcript.createdAt || transcript.exportedAt ? (
          <time
            dateTime={new Date(
              transcript.createdAt ?? transcript.exportedAt ?? 0
            ).toISOString()}
          >
            {new Date(
              transcript.createdAt ?? transcript.exportedAt ?? 0
            ).toLocaleDateString([], { dateStyle: "medium" })}
          </time>
        ) : null}
      </div>
    </header>
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
  </div>
);

const roleMark = (role: string): string => {
  if (role === "user") {
    return "↳";
  }
  if (role === "assistant") {
    return "✦";
  }
  if (role === "system") {
    return "•";
  }
  if (role === "retry") {
    return "!";
  }
  return "·";
};

function Message({ message }: { readonly message: TranscriptMessage }) {
  return (
    <article className={`message message-${message.role}`}>
      {message.parts.map((part, index) => (
        <div className={`share-part part-${part.type}`} key={`${message.id}-${index}`}>
          <div className="part-decoration">
            <span className="role-mark" aria-hidden="true">{roleMark(message.role)}</span>
            <span className="part-bar" />
          </div>
          <div className="part-content">
            <Part part={part} />
          </div>
        </div>
      ))}
    </article>
  );
}

const inlineMarkdown = (text: string): ReactNode[] => {
  const pieces = text.split(
    /(?<code>`[^`]+`)|(?<bold>\*\*[^*]+\*\*)|(?<link>\[[^\]]+\]\([^\s)]+\))/gu
  ).filter((piece): piece is string => typeof piece === "string");
  return pieces.map((piece, index) => {
    if (piece.startsWith("`") && piece.endsWith("`")) {
      return <code key={index}>{piece.slice(1, -1)}</code>;
    }
    if (piece.startsWith("**") && piece.endsWith("**")) {
      return <strong key={index}>{piece.slice(2, -2)}</strong>;
    }
    const link = /^(?<label>[^\]]+)\]\((?<url>[^\s)]+)\)$/u.exec(
      piece.slice(1)
    );
    if (link?.groups) {
      return (
        <a href={link.groups.url} key={index} rel="noreferrer">
          {link.groups.label}
        </a>
      );
    }
    return piece;
  });
};

const Markdown = ({
  text,
  className = "",
}: {
  readonly text: string;
  readonly className?: string;
}) => {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let code: string[] | null = null;
  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }
    blocks.push(
      <p key={`p-${blocks.length}`}>{inlineMarkdown(paragraph.join("\n"))}</p>
    );
    paragraph = [];
  };
  for (const line of lines) {
    if (line.startsWith("```")) {
      if (code === null) {
        flushParagraph();
        code = [];
      } else {
        blocks.push(
          <pre className="code-block" key={`code-${blocks.length}`}>
            {code.join("\n")}
          </pre>
        );
        code = null;
      }
    } else if (code !== null) {
      code.push(line);
    } else if (/^#{1,3} /u.test(line)) {
      flushParagraph();
      blocks.push(
        <h2 key={`h-${blocks.length}`}>
          {inlineMarkdown(line.replace(/^#{1,3} /u, ""))}
        </h2>
      );
    } else if (/^[-*] /u.test(line)) {
      flushParagraph();
      blocks.push(
        <div className="markdown-list-item" key={`li-${blocks.length}`}>
          {inlineMarkdown(line.slice(2))}
        </div>
      );
    } else if (line === "") {
      flushParagraph();
    } else {
      paragraph.push(line);
    }
  }
  if (code !== null) {
    blocks.push(
      <pre className="code-block" key={`code-${blocks.length}`}>
        {code.join("\n")}
      </pre>
    );
  }
  flushParagraph();
  return <div className={`rich-text ${className}`}>{blocks}</div>;
};

function Part({ part }: { readonly part: TranscriptPart }) {
  if (part.type === "text") {
    return <Markdown text={part.text} />;
  }
  if (part.type === "reasoning") {
    return (
      <details className="reasoning">
        <summary>thinking</summary>
        <Markdown text={part.text} />
      </details>
    );
  }
  if (part.type === "shell") {
    return (
      <div className="tool-block shell-block">
        <div className="tool-title"><span className="tool-name">Bash</span><strong>{part.command}</strong></div>
        <div className="tool-content">
          <pre className="command-block"><span className="prompt">$</span> {part.command}</pre>
          {part.output ? <details className="result-disclosure"><summary><span>Show results</span><span>Hide results</span></summary><pre>{part.output}</pre></details> : null}
        </div>
      </div>
    );
  }
  if (part.type === "tool") {
    return (
      <div className="tool-block">
        <div className="tool-title">
          <span className="tool-name">{part.name}</span>
          {part.command ? <strong>{part.command}</strong> : null}
          <em>{part.status}{part.duration && part.duration > 0 ? ` · ${part.duration}ms` : ""}</em>
        </div>
        <div className="tool-content">
          <details className="result-disclosure tool-details">
            <summary><span>Show details</span><span>Hide details</span></summary>
            <pre>{part.input}</pre>
          </details>
          {part.output ? (
            <details className="result-disclosure">
              <summary>
                <span>Show results</span>
                <span>Hide results</span>
              </summary>
              <pre>{part.output}</pre>
            </details>
          ) : null}
        </div>
      </div>
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

const App = () => {
  const [state, setState] = useState<ViewState>({ kind: "loading" });
  const [dark, setDark] = useState<boolean | undefined>();
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const isDark = dark ?? media.matches;
      document.documentElement.dataset.theme = isDark ? "dark" : "light";
    };
    apply();
    const listener = () => {
      if (dark === undefined) {
        apply();
      }
    };
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
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
            {dark ? "light mode" : "dark mode"}
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
