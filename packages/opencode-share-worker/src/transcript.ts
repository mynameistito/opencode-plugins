// oxlint-disable anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type, eslint(complexity), eslint(curly), eslint(prefer-destructuring), sonarjs(no-collapsible-if), sonarjs(no-nested-conditional), unicorn(no-lonely-if), eslint(no-use-before-define)
// oxlint-disable complexity, curly, prefer-destructuring, no-collapsible-if, no-nested-conditional, no-lonely-if
// oxlint-disable eslint/complexity, eslint/curly, eslint/prefer-destructuring, sonarjs/no-collapsible-if, sonarjs/no-nested-conditional, unicorn/no-lonely-if, eslint/no-nested-ternary
/** A safe, renderer-owned transcript model. */
export type TranscriptPart =
  | { readonly type: "text"; readonly text: string }
  | { readonly type: "reasoning"; readonly text: string }
  | {
      readonly type: "tool";
      readonly name: string;
      readonly input: string;
      readonly output: string;
      readonly status: string;
    }
  | { readonly type: "file"; readonly name: string; readonly detail: string }
  | {
      readonly type: "fallback";
      readonly label: string;
      readonly detail: string;
    };

/** A normalized message independent of the OpenCode schema version. */
export interface TranscriptMessage {
  readonly id: string;
  readonly role: string;
  readonly timestamp?: number;
  readonly model?: string;
  readonly parts: readonly TranscriptPart[];
}

/** The complete normalized transcript. */
export interface Transcript {
  readonly version: 2;
  readonly exportedAt?: number;
  readonly messages: readonly TranscriptMessage[];
}

type RecordValue = Record<string, unknown>;

const isRecord = (value: unknown): value is RecordValue =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const stringValue = (record: RecordValue, key: string): string | undefined =>
  typeof record[key] === "string" ? record[key] : undefined;
const numberValue = (record: RecordValue, key: string): number | undefined =>
  typeof record[key] === "number" && Number.isFinite(record[key])
    ? record[key]
    : undefined;
const jsonText = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "[unavailable]";
  }
};

const normalizePart = (value: unknown): TranscriptPart => {
  if (!isRecord(value)) {
    return { detail: "Malformed part", label: "unknown", type: "fallback" };
  }
  const type = stringValue(value, "type") ?? "unknown";
  if (
    (type === "text" || type === "reasoning") &&
    typeof value.text === "string"
  ) {
    return { text: value.text, type };
  }
  if (type === "tool") {
    const state = isRecord(value.state) ? value.state : undefined;
    return {
      input: jsonText(state?.input ?? ""),
      name: stringValue(value, "name") ?? stringValue(value, "tool") ?? "tool",
      output:
        typeof state?.output === "string"
          ? state.output
          : typeof state?.error === "string"
            ? state.error
            : "",
      status: stringValue(state ?? {}, "status") ?? "unknown",
      type: "tool",
    };
  }
  if (type === "file") {
    return {
      detail: stringValue(value, "mime") ?? "attachment",
      name:
        stringValue(value, "filename") ?? stringValue(value, "name") ?? "file",
      type: "file",
    };
  }
  return { detail: jsonText(value), label: type, type: "fallback" };
};

const normalizeMessage = (
  value: unknown,
  index: number
): TranscriptMessage | "malformed" => {
  if (!isRecord(value) || typeof value.type !== "string") {
    return "malformed";
  }
  const { type } = value;
  const parts: TranscriptPart[] = [];
  if (typeof value.text === "string") {
    parts.push({ text: value.text, type: "text" });
  }
  if (Array.isArray(value.content)) {
    for (const part of value.content) {
      parts.push(normalizePart(part));
    }
  }
  if (type === "shell") {
    parts.push({
      detail: stringValue(value, "output") ?? "",
      label: stringValue(value, "command") ?? "shell",
      type: "fallback",
    });
  }
  if (type === "system" || type === "synthetic" || type === "skill") {
    if (parts.length === 0) {
      parts.push({
        text:
          stringValue(value, "description") ?? stringValue(value, "text") ?? "",
        type: "text",
      });
    }
  }
  if (parts.length === 0) {
    parts.push({ detail: jsonText(value), label: type, type: "fallback" });
  }
  const model = isRecord(value.model)
    ? (stringValue(value.model, "id") ?? stringValue(value.model, "modelID"))
    : undefined;
  return {
    id: stringValue(value, "id") ?? `message-${index + 1}`,
    model,
    parts,
    role:
      type === "assistant" || type === "user" || type === "system"
        ? type
        : "other",
    timestamp: isRecord(value.time)
      ? numberValue(value.time, "created")
      : undefined,
  };
};

/** Parse the versioned envelope or the existing raw message array. */
export const parseTranscript = (
  value: unknown
): Transcript | "malformed" | "unsupported" => {
  let messages: readonly unknown[];
  let exportedAt: number | undefined;
  if (Array.isArray(value)) {
    messages = value;
  } else if (isRecord(value) && value.version === 2) {
    if (value.kind !== "opencode-session" || !Array.isArray(value.messages)) {
      return "malformed";
    }
    messages = value.messages;
    exportedAt = numberValue(value, "exportedAt");
  } else if (isRecord(value) && typeof value.version === "number") {
    return "unsupported";
  } else {
    return "malformed";
  }
  const normalized: TranscriptMessage[] = [];
  for (const [index, message] of messages.entries()) {
    const item = normalizeMessage(message, index);
    if (item === "malformed") {
      return "malformed";
    }
    normalized.push(item);
  }
  return { exportedAt, messages: normalized, version: 2 };
};
