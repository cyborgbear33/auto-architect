/**
 * Warm NDJSON client for `python3 -m logos serve`.
 *
 * One long-lived Python process answers newline-delimited JSON. With engine
 * `--workers N` (N>1), replies may complete out of order — we demux by request
 * `id`. Stdin writes are serialized (pipe safety); in-flight calls run
 * concurrently so multi-vehicle fan-out is not client-serialized.
 *
 * Payload parsers receive `reply.result` — never the outer serve envelope.
 *
 * Ported unchanged from @garden/logos-bridge/serve-client.ts — the serve
 * transport protocol is domain-agnostic.
 */
import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface, type Interface } from "node:readline";
import {
  LogosNotAvailableError,
  LogosProtocolError,
  LogosSolveError,
  LogosTimeoutError,
  throwIfSchemaValidationFailed,
} from "./errors.ts";
import { assertWireMetaCompatible } from "./types.ts";

export interface ServeRequest {
  id?: string;
  command: string;
  input?: unknown;
  args?: Record<string, unknown>;
}

export interface ServeReply {
  id?: unknown;
  ok: boolean;
  exit_code: number;
  request_command?: string | null;
  result?: unknown;
  error?: string;
  engine_version?: string;
  schema_version?: string;
  command?: string;
}

export interface LogosServeClient {
  /** Send one request; resolves with the parsed serve reply (after meta check). */
  call(req: ServeRequest, opts?: { timeoutMs?: number }): Promise<ServeReply>;
  /** Last engine_version seen (from ping or any reply). */
  engineVersion(): string | undefined;
  /** Graceful shutdown + kill if needed. */
  close(): Promise<void>;
}

export interface LogosServeClientConfig {
  pythonBin?: string;
  /** Default per-call wall-clock timeout. */
  timeoutMs?: number;
  /**
   * Process-pool size for `logos serve --workers N`. When omitted, the engine
   * uses `LOGOS_SERVE_WORKERS` or `min(4, cpu_count)`.
   */
  workers?: number;
  /** Override spawn (tests). */
  spawnFn?: typeof spawn;
}

const DEFAULT_TIMEOUT_MS = 10_000;

interface Pending {
  resolve: (reply: ServeReply) => void;
  reject: (err: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  command: string;
}

export function createLogosServeClient(config: LogosServeClientConfig = {}): LogosServeClient {
  const pythonBin = config.pythonBin ?? process.env.LOGOS_PYTHON_BIN ?? "python3";
  const defaultTimeout = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const spawnFn = config.spawnFn ?? spawn;
  const workers = config.workers;

  let child: ChildProcessWithoutNullStreams | null = null;
  let rl: Interface | null = null;
  let engineVersion: string | undefined;
  let closed = false;
  let starting: Promise<void> | null = null;
  /** Serialize stdin writes only — replies demux by id. */
  let writeChain: Promise<void> = Promise.resolve();
  const pending = new Map<string, Pending>();

  function translateSpawnError(err: NodeJS.ErrnoException): never {
    if (err.code === "ENOENT") {
      throw new LogosNotAvailableError(
        `Cannot run '${pythonBin}'. Is Python installed and on PATH? (set LOGOS_PYTHON_BIN to override)`,
      );
    }
    throw new LogosNotAvailableError(`Failed to start LOGOS serve: ${err.message}`, { err });
  }

  function clearProcess(): void {
    child = null;
    rl?.close();
    rl = null;
  }

  function rejectAllPending(err: unknown): void {
    for (const [, p] of pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    pending.clear();
  }

  function killDaemon(): void {
    if (!child) return;
    const proc = child;
    clearProcess();
    try {
      proc.stdin.end();
    } catch {
      /* ignore */
    }
    if (!proc.killed) proc.kill("SIGTERM");
    setTimeout(() => {
      if (!proc.killed) proc.kill("SIGKILL");
    }, 500).unref?.();
  }

  function deliverReply(reply: ServeReply): void {
    const key = reply.id === undefined || reply.id === null ? undefined : String(reply.id);
    const p = key !== undefined ? pending.get(key) : undefined;
    if (!p) return;
    pending.delete(key!);
    clearTimeout(p.timer);
    try {
      assertWireMetaCompatible(reply);
      if (typeof reply.engine_version === "string") engineVersion = reply.engine_version;
      p.resolve(reply);
    } catch (err) {
      p.reject(err);
    }
  }

  function attachHandlers(proc: ChildProcessWithoutNullStreams, reader: Interface): void {
    reader.on("line", (rawLine: string) => {
      if (child !== proc) return; // stale daemon after restart
      let reply: ServeReply;
      try {
        reply = JSON.parse(rawLine) as ServeReply;
      } catch {
        const err = new LogosProtocolError("LOGOS serve produced non-JSON output.", {
          stdout: rawLine.slice(0, 500),
        });
        rejectAllPending(err);
        killDaemon();
        return;
      }
      deliverReply(reply);
    });

    proc.on("exit", () => {
      // Ignore exits from a daemon we already replaced (timeout restart).
      if (child !== proc) return;
      clearProcess();
      rejectAllPending(new LogosNotAvailableError("LOGOS serve exited during a call."));
    });
  }

  function writeLine(line: string): Promise<void> {
    const run = writeChain.then(
      () =>
        new Promise<void>((resolve, reject) => {
          if (!child) {
            reject(new LogosNotAvailableError("LOGOS serve is not running."));
            return;
          }
          try {
            child.stdin.write(line, (err) => {
              if (err) reject(err);
              else resolve();
            });
          } catch (err) {
            reject(err);
          }
        }),
    );
    writeChain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  function enqueue(req: ServeRequest, timeoutMs: number): Promise<ServeReply> {
    if (!child || !rl) throw new LogosNotAvailableError("LOGOS serve is not running.");
    const id = req.id ?? randomUUID();
    const line = JSON.stringify({ ...req, id }) + "\n";

    return new Promise<ServeReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!pending.has(id)) return;
        const err = new LogosTimeoutError(
          `LOGOS serve call "${req.command}" exceeded ${timeoutMs}ms; daemon restarted.`,
        );
        rejectAllPending(err);
        killDaemon();
      }, timeoutMs);

      pending.set(id, { resolve, reject, timer, command: req.command });

      writeLine(line).catch((err) => {
        if (!pending.has(id)) return;
        pending.delete(id);
        clearTimeout(timer);
        reject(err);
      });
    });
  }

  function ensureStarted(): Promise<void> {
    if (closed) return Promise.reject(new LogosNotAvailableError("LOGOS serve client is closed."));
    if (child && !child.killed) return Promise.resolve();
    if (starting) return starting;

    starting = new Promise<void>((resolve, reject) => {
      let settled = false;
      const finishOk = () => {
        if (settled) return;
        settled = true;
        starting = null;
        resolve();
      };
      const finishErr = (err: unknown) => {
        if (settled) return;
        settled = true;
        starting = null;
        rejectAllPending(err);
        clearProcess();
        reject(err);
      };

      let proc: ChildProcessWithoutNullStreams;
      const args = ["-m", "logos", "serve"];
      if (workers !== undefined) {
        args.push("--workers", String(Math.max(1, workers)));
      }
      try {
        proc = spawnFn(pythonBin, args, {
          stdio: ["pipe", "pipe", "pipe"],
        }) as ChildProcessWithoutNullStreams;
      } catch (err) {
        finishErr(err);
        return;
      }

      child = proc;
      rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });

      const onEarlyExit = (code: number | null, signal: NodeJS.Signals | null) => {
        finishErr(
          new LogosNotAvailableError(
            `LOGOS serve exited before ready (code=${code}, signal=${signal}). Is the logos package installed?`,
          ),
        );
      };
      proc.once("error", (err) => {
        try {
          translateSpawnError(err as NodeJS.ErrnoException);
        } catch (e) {
          finishErr(e);
        }
      });
      proc.once("exit", onEarlyExit);

      attachHandlers(proc, rl);

      enqueue({ command: "ping" }, defaultTimeout)
        .then((reply) => {
          proc.off("exit", onEarlyExit);
          if (
            !reply.ok ||
            reply.exit_code !== 0 ||
            !(reply.result as { pong?: boolean } | undefined)?.pong
          ) {
            throw new LogosNotAvailableError("LOGOS serve ping failed.", { reply });
          }
          finishOk();
        })
        .catch((err) => {
          proc.off("exit", onEarlyExit);
          proc.kill("SIGKILL");
          finishErr(err);
        });
    });

    return starting;
  }

  return {
    engineVersion: () => engineVersion,

    async call(req, opts) {
      const timeoutMs = opts?.timeoutMs ?? defaultTimeout;
      await ensureStarted();
      return enqueue(req, timeoutMs);
    },

    async close() {
      if (closed) return;
      closed = true;
      if (!child) {
        rejectAllPending(new LogosNotAvailableError("LOGOS serve client is closed."));
        return;
      }
      const proc = child;
      try {
        const reply = await enqueue({ command: "shutdown" }, 1_000);
        if (!(reply.result as { shutdown?: boolean } | undefined)?.shutdown) {
          killDaemon();
        } else {
          try {
            proc.stdin.end();
          } catch {
            /* ignore */
          }
          setTimeout(() => {
            if (!proc.killed) proc.kill("SIGKILL");
            clearProcess();
          }, 200).unref?.();
        }
      } catch {
        killDaemon();
      }
      rejectAllPending(new LogosNotAvailableError("LOGOS serve client is closed."));
    },
  };
}

/** Map a serve reply into a payload for `*FromWire`, salvaging exit 1 when asked. */
export function payloadFromServeReply(
  reply: ServeReply,
  opts: { salvageNonZero: boolean; command: string },
): unknown {
  const code = reply.exit_code;
  const exitCode = typeof code === "number" ? code : null;

  // Schema failures are hard-fails even if someone mistakenly salvages exit 2.
  if (reply.result !== undefined) {
    throwIfSchemaValidationFailed(reply.result, exitCode);
  }

  if (reply.result !== undefined && (code === 0 || (opts.salvageNonZero && code === 1))) {
    return reply.result;
  }
  if (typeof reply.error === "string" && reply.error.includes("No module named logos")) {
    throw new LogosNotAvailableError(
      "The `logos` package is not installed for this Python. Install it: " +
        "pip install -e /path/to/metalanguage/engine",
      { error: reply.error },
    );
  }
  throw new LogosSolveError(
    `LOGOS ${opts.command} failed via serve.`,
    exitCode,
    typeof reply.error === "string" ? reply.error : "",
  );
}
