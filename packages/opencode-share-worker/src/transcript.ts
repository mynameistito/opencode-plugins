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
      readonly duration?: number;
      readonly command?: string;
    }
  | {
      readonly type: "shell";
      readonly command: string;
      readonly output: string;
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
  readonly createdAt?: number;
  readonly title?: string;
  readonly model?: string;
  readonly provider?: string;
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

const normalizeTool = (
  value: RecordValue,
  state: RecordValue | undefined
): TranscriptPart => {
  const time = isRecord(state?.time) ? state.time : undefined;
  const input = state?.input ?? value.input ?? "";
  const start = time ? numberValue(time, "start") : undefined;
  const end = time ? numberValue(time, "end") : undefined;
  const output =
    stringValue(state ?? {}, "output") ??
    stringValue(state ?? {}, "error") ??
    "";
  return {
    command: isRecord(input) ? stringValue(input, "command") : undefined,
    duration:
      start !== undefined && end !== undefined ? end - start : undefined,
    input: jsonText(input),
    name: stringValue(value, "name") ?? stringValue(value, "tool") ?? "tool",
    output,
    status: stringValue(state ?? {}, "status") ?? "unknown",
    type: "tool",
  };
};

const messageRole = (type: string): string => {
  const knownRoles = new Set([
    "assistant",
    "compaction",
    "retry",
    "system",
    "tool-call",
    "tool-result",
    "user",
  ]);
  if (knownRoles.has(type)) {
    return type;
  }
  if (["reasoning", "shell", "file"].includes(type)) {
    return type;
  }
  return "other";
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
  if (type === "tool" || type === "tool-call" || type === "tool-result") {
    const state = isRecord(value.state) ? value.state : undefined;
    return normalizeTool(value, state);
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
      command: stringValue(value, "command") ?? "shell",
      output: stringValue(value, "output") ?? "",
      type: "shell",
    });
  }
  if (
    (type === "system" || type === "synthetic" || type === "skill") &&
    parts.length === 0
  ) {
    parts.push({
      text:
        stringValue(value, "description") ?? stringValue(value, "text") ?? "",
      type: "text",
    });
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
    role: messageRole(type),
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
  let title: string | undefined;
  let model: string | undefined;
  let provider: string | undefined;
  if (Array.isArray(value)) {
    messages = value;
  } else if (isRecord(value) && value.version === 2) {
    if (value.kind !== "opencode-session" || !Array.isArray(value.messages)) {
      return "malformed";
    }
    ({ messages } = value);
    exportedAt = numberValue(value, "exportedAt");
    title = stringValue(value, "title");
    model = stringValue(value, "model");
    provider = stringValue(value, "provider");
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
    model ??= item.model;
  }
  const createdAt = normalized.find((item) => item.timestamp)?.timestamp;
  return {
    createdAt,
    exportedAt,
    messages: normalized,
    model,
    provider,
    title,
    version: 2,
  };
};
