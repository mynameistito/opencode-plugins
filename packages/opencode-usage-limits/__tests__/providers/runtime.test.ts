import { rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { Effect, Exit } from "effect";
import { afterEach, describe, expect, test } from "vitest";

import {
  ProviderCommandExecutor,
  ProviderCommandExecutorLive,
} from "@/providers/runtime/command.ts";
import {
  ProviderFileSystem,
  ProviderFileSystemLive,
} from "@/providers/runtime/filesystem.ts";
import {
  makeProviderHttpClient,
  ProviderHttpClient,
} from "@/providers/runtime/http.ts";

const executeCommand = (args: readonly string[], timeoutMs = 1000) =>
  Effect.runPromise(
    Effect.gen(function* execute() {
      const commands = yield* ProviderCommandExecutor;
      return yield* commands.execute({
        args,
        command: process.execPath,
        providerID: "qwen",
        timeoutMs,
      });
    }).pipe(Effect.provide(ProviderCommandExecutorLive))
  );

const executeCommandExit = (
  args: readonly string[],
  acceptedExitCodes?: ReadonlySet<number>
) =>
  Effect.runPromiseExit(
    Effect.gen(function* execute() {
      const commands = yield* ProviderCommandExecutor;
      return yield* commands.execute({
        acceptedExitCodes,
        args,
        command: process.execPath,
        providerID: "qwen",
        timeoutMs: 1000,
      });
    }).pipe(Effect.provide(ProviderCommandExecutorLive))
  );

describe("provider runtime services", () => {
  const temporaryFiles: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryFiles.splice(0).map((file) => rm(file, { force: true }))
    );
  });

  test("rejects oversized provider auth files before reading their contents", async () => {
    const file = path.join(
      tmpdir(),
      `oc-usage-limits-${crypto.randomUUID()}.json`
    );
    temporaryFiles.push(file);
    await writeFile(file, "x".repeat(1024 * 1024 + 1));

    const result = await Effect.runPromise(
      Effect.gen(function* result() {
        const files = yield* ProviderFileSystem;
        return yield* files.readText({ path: file, providerID: "codex" });
      }).pipe(Effect.provide(ProviderFileSystemLive), Effect.exit)
    );

    const serializedCause = JSON.stringify(
      Exit.isFailure(result) ? result.cause : undefined
    );
    expect(Exit.isFailure(result)).toBeTruthy();
    expect(serializedCause).toContain('"_tag":"ProviderTransportError"');
    expect(serializedCause).toContain('"cause":"output-limit"');
    expect(serializedCause).toContain('"operation":"read-auth"');
  });

  test("reads the complete contents of a bounded provider auth file", async () => {
    const file = path.join(
      tmpdir(),
      `oc-usage-limits-${crypto.randomUUID()}.json`
    );
    temporaryFiles.push(file);
    const content = JSON.stringify({
      accessToken: "token",
      padding: "x".repeat(1024),
    });
    await writeFile(file, content);

    const result = await Effect.runPromise(
      Effect.gen(function* result() {
        const files = yield* ProviderFileSystem;
        return yield* files.readText({ path: file, providerID: "codex" });
      }).pipe(Effect.provide(ProviderFileSystemLive))
    );

    expect(result).toBe(content);
  });

  test("decodes bounded HTTP JSON and classifies malformed bodies", async () => {
    const layer = makeProviderHttpClient(() =>
      Promise.resolve(new Response("not-json", { status: 200 }))
    );

    const result = await Effect.runPromise(
      Effect.gen(function* result() {
        const http = yield* ProviderHttpClient;
        return yield* http.requestJson({
          headers: {},
          method: "GET",
          providerID: "codex",
          timeoutMs: 1000,
          url: "https://example.test/usage",
        });
      }).pipe(Effect.provide(layer), Effect.exit)
    );

    const cause = Exit.isFailure(result) ? result.cause : undefined;
    expect(Exit.isFailure(result)).toBeTruthy();
    expect(cause).toBeDefined();
  });

  test("cancels a response rejected by its declared size", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel: () => {
        cancelled = true;
      },
    });
    const layer = makeProviderHttpClient(() =>
      Promise.resolve(
        new Response(body, {
          headers: { "content-length": String(2 * 1024 * 1024 + 1) },
          status: 200,
        })
      )
    );

    const result = await Effect.runPromise(
      Effect.gen(function* result() {
        const http = yield* ProviderHttpClient;
        return yield* http.requestJson({
          headers: {},
          method: "GET",
          providerID: "codex",
          timeoutMs: 1000,
          url: "https://example.test/usage",
        });
      }).pipe(Effect.provide(layer), Effect.exit)
    );

    expect(Exit.isFailure(result)).toBeTruthy();
    expect(cancelled).toBeTruthy();
  });

  test("cancels a rate-limited response body", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel: () => {
        cancelled = true;
      },
    });
    const layer = makeProviderHttpClient(() =>
      Promise.resolve(new Response(body, { status: 429 }))
    );

    const result = await Effect.runPromise(
      Effect.gen(function* result() {
        const http = yield* ProviderHttpClient;
        return yield* http.requestJson({
          headers: {},
          method: "GET",
          providerID: "codex",
          timeoutMs: 1000,
          url: "https://example.test/usage",
        });
      }).pipe(Effect.provide(layer), Effect.exit)
    );

    expect(Exit.isFailure(result)).toBeTruthy();
    expect(cancelled).toBeTruthy();
  });

  test("cancels a non-success response body", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel: () => {
        cancelled = true;
      },
    });
    const layer = makeProviderHttpClient(() =>
      Promise.resolve(new Response(body, { status: 401 }))
    );

    const result = await Effect.runPromise(
      Effect.gen(function* result() {
        const http = yield* ProviderHttpClient;
        return yield* http.requestJson({
          headers: {},
          method: "GET",
          providerID: "codex",
          timeoutMs: 1000,
          url: "https://example.test/usage",
        });
      }).pipe(Effect.provide(layer), Effect.exit)
    );

    expect(Exit.isFailure(result)).toBeTruthy();
    expect(cancelled).toBeTruthy();
  });

  test("decodes JSON split across response chunks", async () => {
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode('{"plan":'));
        controller.enqueue(encoder.encode('"pro"'));
        controller.enqueue(encoder.encode("}"));
        controller.close();
      },
    });
    const layer = makeProviderHttpClient(() =>
      Promise.resolve(new Response(body, { status: 200 }))
    );

    const result = await Effect.runPromise(
      Effect.gen(function* result() {
        const http = yield* ProviderHttpClient;
        return yield* http.requestJson({
          headers: {},
          method: "GET",
          providerID: "codex",
          timeoutMs: 1000,
          url: "https://example.test/usage",
        });
      }).pipe(Effect.provide(layer))
    );

    expect(result).toStrictEqual({ plan: "pro" });
  });

  test("reads a response with many small chunks", async () => {
    const whitespace = new Uint8Array([32]);
    const body = new ReadableStream<Uint8Array>({
      start: (controller) => {
        for (let index = 0; index < 20_000; index += 1) {
          controller.enqueue(whitespace);
        }
        controller.enqueue(new TextEncoder().encode("null"));
        controller.close();
      },
    });
    const layer = makeProviderHttpClient(() =>
      Promise.resolve(new Response(body, { status: 200 }))
    );

    const result = await Effect.runPromise(
      Effect.gen(function* result() {
        const http = yield* ProviderHttpClient;
        return yield* http.requestJson({
          headers: {},
          method: "GET",
          providerID: "codex",
          timeoutMs: 5000,
          url: "https://example.test/usage",
        });
      }).pipe(Effect.provide(layer))
    );

    expect(result).toBeNull();
  });

  test("classifies commands that cannot be spawned", async () => {
    const result = await Effect.runPromiseExit(
      Effect.gen(function* execute() {
        const commands = yield* ProviderCommandExecutor;
        return yield* commands.execute({
          args: [],
          command: path.join(tmpdir(), `missing-${crypto.randomUUID()}`),
          providerID: "qwen",
          timeoutMs: 1000,
        });
      }).pipe(Effect.provide(ProviderCommandExecutorLive))
    );

    const serializedCause = JSON.stringify(
      Exit.isFailure(result) ? result.cause : undefined
    );
    expect(Exit.isFailure(result)).toBeTruthy();
    expect(serializedCause).toContain('"cause":"command"');
  });

  test("executes a controlled command and returns trimmed stdout", async () => {
    const output = await executeCommand([
      "-e",
      'process.stdout.write(" usage output \\n")',
    ]);

    expect(output).toBe("usage output");
  });

  test("rejects unaccepted exits and accepts configured exit codes", async () => {
    const args = ["-e", 'process.stdout.write("status"); process.exit(2)'];

    const rejected = await executeCommandExit(args);
    const serializedCause = JSON.stringify(
      Exit.isFailure(rejected) ? rejected.cause : undefined
    );
    expect(Exit.isFailure(rejected)).toBeTruthy();
    expect(serializedCause).toContain('"_tag":"ProviderCommandError"');
    expect(serializedCause).toContain('"exitCode":2');

    const accepted = await executeCommandExit(args, new Set([2]));
    expect(accepted).toStrictEqual(Exit.succeed("status"));
  });

  test.each([
    ["stdout", 'process.stdout.write("x".repeat(2 * 1024 * 1024 + 1))'],
    ["stderr", 'process.stderr.write("x".repeat(2 * 1024 * 1024 + 1))'],
  ])("caps oversized command %s output", async (_stream, script) => {
    const result = await executeCommandExit(["-e", script]);

    const serializedCause = JSON.stringify(
      Exit.isFailure(result) ? result.cause : undefined
    );
    expect(Exit.isFailure(result)).toBeTruthy();
    expect(serializedCause).toContain('"cause":"output-limit"');
  });

  test("kills a timed-out command", async () => {
    const file = path.join(
      tmpdir(),
      `oc-usage-limits-command-${crypto.randomUUID()}.txt`
    );
    temporaryFiles.push(file);
    const script = `
       const { writeFile } = require("node:fs/promises");
       const file = process.argv[1];
       const write = () => writeFile(file, String(Date.now())).then(() => setTimeout(write, 10));
       write();
    `;

    const result = await Effect.runPromiseExit(
      Effect.gen(function* execute() {
        const commands = yield* ProviderCommandExecutor;
        return yield* commands.execute({
          args: ["-e", script, file],
          command: process.execPath,
          providerID: "qwen",
          timeoutMs: 200,
        });
      }).pipe(Effect.provide(ProviderCommandExecutorLive))
    );

    const serializedCause = JSON.stringify(
      Exit.isFailure(result) ? result.cause : undefined
    );
    expect(Exit.isFailure(result)).toBeTruthy();
    expect(serializedCause).toContain('"_tag":"ProviderTimeoutError"');

    await delay(100);
    const before = await stat(file);
    await delay(100);
    const after = await stat(file);
    expect(after.mtimeMs).toBe(before.mtimeMs);
  });

  test("classifies an interrupted HTTP request as a timeout", async () => {
    const layer = makeProviderHttpClient(() => Effect.runPromise(Effect.never));
    const result = await Effect.runPromise(
      Effect.gen(function* result() {
        const http = yield* ProviderHttpClient;
        return yield* http.requestJson({
          headers: {},
          method: "GET",
          providerID: "qwen",
          timeoutMs: 1,
          url: "https://example.test/usage",
        });
      }).pipe(Effect.provide(layer), Effect.exit)
    );

    const cause = Exit.isFailure(result) ? result.cause : undefined;
    expect(Exit.isFailure(result)).toBeTruthy();
    expect(cause).toBeDefined();
  });

  test.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [500, "http"],
  ])("classifies HTTP status %d as %s", async (status, cause) => {
    const layer = makeProviderHttpClient(() =>
      Promise.resolve(new Response(null, { status }))
    );
    const result = await Effect.runPromise(
      Effect.gen(function* request() {
        const http = yield* ProviderHttpClient;
        return yield* http.requestJson({
          headers: {},
          method: "GET",
          providerID: "codex",
          timeoutMs: 1000,
          url: "https://example.test/usage",
        });
      }).pipe(Effect.provide(layer), Effect.exit)
    );

    const serializedCause = JSON.stringify(
      Exit.isFailure(result) ? result.cause : undefined
    );
    expect(Exit.isFailure(result)).toBeTruthy();
    expect(serializedCause).toContain(`"cause":"${cause}"`);
  });

  test("caps streamed HTTP bodies and classifies network failures", async () => {
    let cancelled = false;
    const layer = makeProviderHttpClient(() =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            cancel: () => {
              cancelled = true;
              return Promise.reject(new Error("cancel failed"));
            },
            start: (controller) => {
              controller.enqueue(new Uint8Array(2 * 1024 * 1024 + 1));
            },
          }),
          { status: 200 }
        )
      )
    );
    const capped = await Effect.runPromise(
      Effect.gen(function* request() {
        const http = yield* ProviderHttpClient;
        return yield* http.requestJson({
          headers: {},
          method: "GET",
          providerID: "codex",
          timeoutMs: 1000,
          url: "https://example.test/usage",
        });
      }).pipe(Effect.provide(layer), Effect.exit)
    );
    expect(Exit.isFailure(capped)).toBeTruthy();
    expect(cancelled).toBeTruthy();
    const cappedCause = JSON.stringify(
      Exit.isFailure(capped) ? capped.cause : undefined
    );
    expect(cappedCause).toContain('"cause":"output-limit"');

    const networkLayer = makeProviderHttpClient(() =>
      Promise.reject(new Error("offline"))
    );
    const network = await Effect.runPromise(
      Effect.gen(function* request() {
        const http = yield* ProviderHttpClient;
        return yield* http.requestJson({
          headers: {},
          method: "GET",
          providerID: "codex",
          timeoutMs: 1000,
          url: "https://example.test/usage",
        });
      }).pipe(Effect.provide(networkLayer), Effect.exit)
    );
    expect(Exit.isFailure(network)).toBeTruthy();
    const networkCause = JSON.stringify(
      Exit.isFailure(network) ? network.cause : undefined
    );
    expect(networkCause).toContain('"cause":"network"');
  });
});
