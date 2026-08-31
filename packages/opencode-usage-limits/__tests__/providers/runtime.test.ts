import { afterEach, describe, expect, test } from "bun:test";
import { rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { Effect, Exit } from "effect";

import { ProviderClock, ProviderClockLive } from "@/providers/runtime/clock.ts";
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
    await Bun.write(file, "x".repeat(1024 * 1024 + 1));

    const result = await Effect.runPromise(
      Effect.gen(function* result() {
        const files = yield* ProviderFileSystem;
        return yield* files.readText({ path: file, providerID: "codex" });
      }).pipe(Effect.provide(ProviderFileSystemLive), Effect.exit)
    );

    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      const serializedCause = JSON.stringify(result.cause);
      expect(serializedCause).toContain('"_tag":"ProviderTransportError"');
      expect(serializedCause).toContain('"cause":"output-limit"');
      expect(serializedCause).toContain('"operation":"read-auth"');
    }
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
    await Bun.write(file, content);

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

    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      expect(result.cause).toBeDefined();
    }
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

    expect(Exit.isFailure(result)).toBe(true);
    expect(cancelled).toBe(true);
  });

  test("uses the Effect clock for deterministic provider timestamps", async () => {
    const now = await Effect.runPromise(
      ProviderClock.pipe(Effect.flatMap((clock) => clock.now)).pipe(
        Effect.provide(ProviderClockLive)
      )
    );

    expect(now).toBeInstanceOf(Date);
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
    expect(Exit.isFailure(rejected)).toBe(true);
    if (Exit.isFailure(rejected)) {
      const serializedCause = JSON.stringify(rejected.cause);
      expect(serializedCause).toContain('"_tag":"ProviderCommandError"');
      expect(serializedCause).toContain('"exitCode":2');
    }

    const accepted = await executeCommandExit(args, new Set([2]));
    expect(accepted).toEqual(Exit.succeed("status"));
  });

  test("kills a timed-out command", async () => {
    const file = path.join(
      tmpdir(),
      `oc-usage-limits-command-${crypto.randomUUID()}.txt`
    );
    temporaryFiles.push(file);
    const script = `
      const file = process.argv[1];
      const write = () => Bun.write(file, String(Date.now())).then(() => setTimeout(write, 10));
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

    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      const serializedCause = JSON.stringify(result.cause);
      expect(serializedCause).toContain('"_tag":"ProviderTimeoutError"');
    }

    await Bun.sleep(100);
    const before = await stat(file);
    await Bun.sleep(100);
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

    expect(Exit.isFailure(result)).toBe(true);
    if (Exit.isFailure(result)) {
      expect(result.cause).toBeDefined();
    }
  });
});
