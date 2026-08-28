// oxlint-disable anti-slop/no-runtime-typeof, eslint/sort-keys, eslint/curly
import { expect, test } from "bun:test";

import { parseTranscript } from "../src/transcript";

const message = {
  content: [
    { text: "answer", type: "text" },
    {
      name: "shell",
      state: { input: { command: "pwd" }, output: "/tmp", status: "completed" },
      type: "tool",
    },
    { text: "thinking", type: "reasoning" },
    { type: "new-future-part", value: "kept safely" },
  ],
  id: "m1",
  model: { id: "claude-sonnet" },
  time: { created: 1_700_000_000_000 },
  type: "assistant",
} as const;

test("normalizes the versioned envelope and known parts", () => {
  const result = parseTranscript({
    exportedAt: 2,
    kind: "opencode-session",
    messages: [message],
    version: 2,
  });
  expect(result).toMatchObject({
    exportedAt: 2,
    messages: [{ model: "claude-sonnet", role: "assistant" }],
    version: 2,
  });
  if (typeof result === "object") {
    expect(result.messages[0]?.parts).toHaveLength(4);
  }
});

test("keeps compatibility with the existing raw array", () => {
  const result = parseTranscript([{ id: "u1", text: "hello", type: "user" }]);
  expect(result).toMatchObject({
    messages: [{ parts: [{ text: "hello", type: "text" }], role: "user" }],
    version: 2,
  });
});

test("rejects malformed and unsupported envelopes", () => {
  expect(parseTranscript({ kind: "wrong", messages: [], version: 2 })).toBe(
    "malformed"
  );
  expect(parseTranscript({ messages: [], version: 9 })).toBe("unsupported");
  expect(parseTranscript([null])).toBe("malformed");
});

test("renders unknown parts as safe fallbacks", () => {
  const result = parseTranscript([
    { content: [{ html: "<script>", type: "future" }], type: "assistant" },
  ]);
  expect(result).toMatchObject({
    messages: [{ parts: [{ label: "future", type: "fallback" }] }],
  });
});
