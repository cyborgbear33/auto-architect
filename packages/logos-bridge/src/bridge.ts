/**
 * The real bridge: shells out to `python3 -m logos <cmd> … --json`.
 *
 * Transports:
 * - `serve` (default): warm NDJSON daemon (`logos serve`) — keeps TBox cache warm
 * - `subprocess`: one process per call, JSON on stdin via `-`
 *   (set `LOGOS_TRANSPORT=subprocess` to opt out)
 *
 * Uses spawn / execFile with argv arrays (no shell) so free-text fields can
 * never cause shell injection. Stdin must be explicitly ended — Node's
 * `execFile({ input })` does not close stdin for LOGOS's `-` reader.
 *
 * Ported unchanged from @garden/logos-bridge/bridge.ts — the transport and
 * salvage logic is domain-agnostic; only the result type (DiagnosticSolution
 * instead of GardenSolution) differs.
 */
import { spawn } from "node:child_process";
import type { DiagnosticSolution } from "@auto/semantic-types";
import {
  LogosNotAvailableError,
  LogosProtocolError,
  LogosSchemaError,
  LogosSolveError,
  LogosTimeoutError,
  throwIfSchemaValidationFailed,
} from "./errors.ts";
import {
  createLogosServeClient,
  type LogosServeClient,
  payloadFromServeReply,
} from "./serve-client.ts";
import {
  assertWireMetaCompatible,
  type ForecastInput,
  type ForecastResult,
  forecastResultFromWire,
  type LogosProblemInput,
  type OntologyLintInput,
  type OntologyLintResult,
  ontologyLintResultFromWire,
  type RealizeInput,
  type RealizeResult,
  type ReasonInput,
  type ReasonResult,
  type ReviseInput,
  type ReviseResult,
  realizeResultFromWire,
  reasonResultFromWire,
  reviseResultFromWire,
  type StrategizeInput,
  type StrategizeResult,
  solutionFromWire,
  strategizeResultFromWire,
  toForecastFile,
  toOntologyLintFile,
  toRealizeFile,
  toReasonFile,
  toReviseFile,
  toStrategizeFile,
  toVerbalizeArgs,
  toWireProblem,
  type VerbalizeInput,
  type VerbalizeResult,
  verbalizeResultFromWire,
} from "./types.ts";

export type LogosTransport = "subprocess" | "serve";

export interface LogosBridge {
  solve(input: LogosProblemInput, opts?: { timeoutMs?: number }): Promise<DiagnosticSolution>;
  /** Realize an individual against an ontology + ABox (which classes it belongs to). */
  realize(input: RealizeInput, opts?: { timeoutMs?: number }): Promise<RealizeResult>;
  /**
   * Realize many individuals in ONE engine dispatch (fan-out for multi-vehicle
   * scans) — one subprocess start / one serve round-trip instead of N. Results
   * are order-aligned with `inputs`. Falls back to sequential `realize` if the
   * engine doesn't expose `batch` (e.g. an older serve daemon).
   */
  realizeMany(inputs: RealizeInput[], opts?: { timeoutMs?: number }): Promise<RealizeResult[]>;
  /** Gatekeep a proposed ontology revision: is the merged ontology still coherent? */
  revise(input: ReviseInput, opts?: { timeoutMs?: number }): Promise<ReviseResult>;
  /** Project a timeseries toward a threshold (Prediction problem type). */
  forecast(input: ForecastInput, opts?: { timeoutMs?: number }): Promise<ForecastResult>;
  /** Resolve conflicting defeasible conclusions by priority/specificity. */
  reason(input: ReasonInput, opts?: { timeoutMs?: number }): Promise<ReasonResult>;
  /** Render a formula (or controlled English) to English with a round-trip fidelity check. */
  verbalize(input: VerbalizeInput, opts?: { timeoutMs?: number }): Promise<VerbalizeResult>;
  /** Solve an abstract game (decision-under-uncertainty and/or cooperative) and report degeneracy. */
  strategize(input: StrategizeInput, opts?: { timeoutMs?: number }): Promise<StrategizeResult>;
  /** Lint ontology structure + optional registry ↔ engine-family parity (shared engine contract). */
  ontologyLint(
    input: OntologyLintInput,
    opts?: { timeoutMs?: number },
  ): Promise<OntologyLintResult>;
  /** Tear down a warm serve daemon when transport is `serve`. No-op for subprocess. */
  close?(): Promise<void>;
}

/**
 * The subprocess primitive the bridge runs. Resolves with the child's stdout on
 * a clean (exit-0) run; on any other outcome it rejects with an error carrying
 * (code / killed / signal / stdout / stderr) — exactly the shape Node's
 * promisified execFile produces. Injectable so tests need not spawn a process.
 *
 * `input` is written to the child's stdin (used for path commands with `-`).
 */
export type ExecFn = (
  bin: string,
  args: string[],
  opts: { timeout: number; maxBuffer: number; input?: string },
) => Promise<{ stdout: string; stderr: string }>;

export interface LogosBridgeConfig {
  /** Python executable. Default: env LOGOS_PYTHON_BIN, else "python3". */
  pythonBin?: string;
  /** Default per-call timeout in ms. Default 10000. */
  timeoutMs?: number;
  /** The exec primitive. Default: spawn with stdin write+end. */
  exec?: ExecFn;
  /**
   * Transport mode. Default: env `LOGOS_TRANSPORT` when `serve`/`subprocess`,
   * else `serve` (warm daemon so in-process TBox cache survives). Injected
   * `exec` always forces subprocess (unit tests).
   */
  transport?: LogosTransport;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_BUFFER = 1024 * 1024;

/** Spawn with argv (no shell); write `input` and end stdin so `-` readers finish. */
const defaultExec: ExecFn = (bin, args, opts) =>
  new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, opts.timeout);

    child.stdout.on("data", (chunk: Buffer | string) => {
      stdout += chunk;
      if (stdout.length > opts.maxBuffer) {
        child.kill("SIGTERM");
      }
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const err = Object.assign(new Error(`Command failed: ${bin} ${args.join(" ")}`), {
        code: code ?? undefined,
        killed: signal === "SIGTERM",
        signal: signal ?? undefined,
        stdout,
        stderr,
      });
      reject(err);
    });

    if (opts.input !== undefined) {
      child.stdin.write(opts.input, (err) => {
        if (err) {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            reject(err);
          }
          return;
        }
        child.stdin.end();
      });
    } else {
      child.stdin.end();
    }
  });

interface ExecFailure {
  code?: string | number;
  killed?: boolean;
  signal?: string;
  stdout?: string;
  stderr?: string;
}

function resolveTransport(config: LogosBridgeConfig): LogosTransport {
  if (config.exec) return "subprocess";
  if (config.transport === "serve" || config.transport === "subprocess") return config.transport;
  const env = process.env.LOGOS_TRANSPORT?.trim().toLowerCase();
  if (env === "subprocess") return "subprocess";
  return "serve";
}

function parseJsonStdout(stdout: string, label: string, exitCode: number | null = 0): unknown {
  let raw: unknown;
  try {
    raw = JSON.parse(stdout);
  } catch {
    throw new LogosProtocolError(
      `LOGOS ${label} produced non-JSON output; check version compatibility.`,
      {
        stdout: stdout.slice(0, 500),
      },
    );
  }
  throwIfSchemaValidationFailed(raw, exitCode);
  assertWireMetaCompatible(raw);
  return raw;
}

function translateExecError(err: ExecFailure, pythonBin: string, timeoutMs: number): never {
  if (err.code === "ENOENT") {
    throw new LogosNotAvailableError(
      `Cannot run '${pythonBin}'. Is Python installed and on PATH? (set LOGOS_PYTHON_BIN to override)`,
    );
  }
  if (err.killed && err.signal === "SIGTERM") {
    throw new LogosTimeoutError(`LOGOS solve exceeded ${timeoutMs}ms and was terminated.`);
  }
  const stderr = typeof err.stderr === "string" ? err.stderr : "";
  if (stderr.includes("No module named logos")) {
    throw new LogosNotAvailableError(
      "The `logos` package is not installed for this Python. Install it: " +
        "pip install -e /path/to/metalanguage/engine",
      { stderr },
    );
  }
  const exitCode = typeof err.code === "number" ? err.code : null;
  throw new LogosSolveError("LOGOS solve failed.", exitCode, stderr);
}

function verbalizeServeInput(input: VerbalizeInput): {
  input: unknown;
  args: Record<string, unknown>;
} {
  if (input.controlledEnglish !== undefined) {
    return { input: { controlled_english: input.controlledEnglish, ce: true }, args: { ce: true } };
  }
  return { input: input.formula ?? "", args: {} };
}

function realizeServeArgs(input: RealizeInput): Record<string, unknown> | undefined {
  const args: Record<string, unknown> = {};
  if (input.view) args.view = input.view;
  if (input.scope !== undefined) args.scope = input.scope === true ? "auto" : input.scope;
  return Object.keys(args).length > 0 ? args : undefined;
}

export function createLogosBridge(config: LogosBridgeConfig = {}): LogosBridge {
  const pythonBin = config.pythonBin ?? process.env.LOGOS_PYTHON_BIN ?? "python3";
  const exec = config.exec ?? defaultExec;
  const transport = resolveTransport(config);
  const serveClient: LogosServeClient | null =
    transport === "serve"
      ? createLogosServeClient({ pythonBin, timeoutMs: config.timeoutMs })
      : null;

  /** Run `logos <sub> - --json` with JSON on stdin (no temp files). */
  async function runJson(
    sub: string,
    payload: unknown,
    timeoutMs: number,
    salvageExitOne: boolean,
    extraArgs: string[] = [],
  ): Promise<{ stdout: string; exitCode: number }> {
    try {
      const res = await exec(pythonBin, ["-m", "logos", sub, "-", "--json", ...extraArgs], {
        timeout: timeoutMs,
        maxBuffer: MAX_BUFFER,
        input: JSON.stringify(payload),
      });
      return { stdout: res.stdout, exitCode: 0 };
    } catch (execErr) {
      const e = execErr as ExecFailure;
      const out = typeof e.stdout === "string" ? e.stdout : "";
      // Only salvage intentional exit-1 data (escalate / reject / unresolved /
      // lint-not-ok). Exit 2+ (e.g. schema_validation_failed) must not be treated
      // as a successful payload — parse after translate when salvaging, or throw.
      if (salvageExitOne && e.code === 1 && out.trim()) return { stdout: out, exitCode: 1 };
      // Schema failures often still emit JSON on stdout at exit 2 — surface them
      // with shapeErrors before falling through to LogosSolveError.
      if (out.trim()) {
        try {
          const raw = JSON.parse(out);
          throwIfSchemaValidationFailed(raw, typeof e.code === "number" ? e.code : null);
        } catch (parseOrSchema) {
          if (parseOrSchema instanceof LogosSchemaError) throw parseOrSchema;
          // non-JSON → translateExecError below
        }
      }
      translateExecError(e, pythonBin, timeoutMs);
    }
  }

  async function viaServe(
    command: string,
    input: unknown,
    args: Record<string, unknown> | undefined,
    timeoutMs: number,
    salvageNonZero: boolean,
  ): Promise<unknown> {
    const reply = await serveClient!.call({ command, input, args }, { timeoutMs });
    return payloadFromServeReply(reply, { salvageNonZero, command });
  }

  /** Single-realize path, shared by `realize` and the `realizeMany` fallback. */
  async function realizeOne(input: RealizeInput, timeoutMs: number): Promise<RealizeResult> {
    const file = toRealizeFile(input);
    if (serveClient) {
      return realizeResultFromWire(
        await viaServe("realize", file, realizeServeArgs(input), timeoutMs, false),
      );
    }
    const { stdout, exitCode } = await runJson("realize", file, timeoutMs, false);
    return realizeResultFromWire(parseJsonStdout(stdout, "realize", exitCode));
  }

  /**
   * Run N realize calls as one `batch`. Returns the per-item results, or `null`
   * if the engine doesn't expose `batch` (so the caller falls back to
   * sequential). Per-item results carry their own realize payload even when the
   * overall batch exit is non-zero (a bad item is surfaced by throwing here).
   */
  async function realizeManyBatch(
    inputs: RealizeInput[],
    timeoutMs: number,
  ): Promise<RealizeResult[] | null> {
    const calls = inputs.map((inp, i) => {
      const args = realizeServeArgs(inp);
      return {
        id: String(i),
        command: "realize",
        input: toRealizeFile(inp),
        ...(args ? { args } : {}),
      };
    });

    let results: unknown[];
    if (serveClient) {
      const reply = await serveClient.call({ command: "batch", input: calls }, { timeoutMs });
      const payload = reply.result as { results?: unknown[] } | undefined;
      if (!payload?.results) {
        // Old serve daemon without `batch` → signal fallback; anything else is a real failure.
        if (typeof reply.error === "string" && /unknown command:\s*batch/i.test(reply.error))
          return null;
        throw new LogosSolveError(
          "LOGOS batch failed via serve.",
          reply.exit_code ?? null,
          reply.error ?? "",
        );
      }
      results = payload.results;
    } else {
      let stdout = "";
      try {
        stdout = (
          await exec(pythonBin, ["-m", "logos", "batch", "-", "--json"], {
            timeout: timeoutMs,
            maxBuffer: MAX_BUFFER,
            input: JSON.stringify(calls),
          })
        ).stdout;
      } catch (execErr) {
        // `batch` emits its envelope on stdout even at exit 2 (per-item hard fails);
        // only a missing subcommand / no output means "unsupported" → fall back.
        const failStdout = (execErr as ExecFailure).stdout;
        stdout = typeof failStdout === "string" ? failStdout : "";
        if (!stdout.trim()) return null;
      }
      let parsed: { results?: unknown[] };
      try {
        parsed = JSON.parse(stdout);
      } catch {
        return null;
      }
      if (!parsed.results) return null;
      results = parsed.results;
    }

    return results.map((r, i) => {
      const entry = (r ?? {}) as { id?: string; result?: unknown; error?: string };
      if (entry.result === undefined) {
        throw new LogosSolveError(
          `LOGOS batch item ${entry.id ?? i} (realize) failed.`,
          null,
          entry.error ?? "",
        );
      }
      return realizeResultFromWire(entry.result);
    });
  }

  return {
    async solve(input: LogosProblemInput, opts): Promise<DiagnosticSolution> {
      const timeoutMs = opts?.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const wire = toWireProblem(input);
      if (serveClient) {
        return solutionFromWire(await viaServe("solve", wire, undefined, timeoutMs, true));
      }
      // solve --json exits 1 on `kind: "escalate"` but with valid JSON on stdout.
      const { stdout, exitCode } = await runJson("solve", wire, timeoutMs, true);
      return solutionFromWire(parseJsonStdout(stdout, "solve", exitCode));
    },

    async realize(input: RealizeInput, opts): Promise<RealizeResult> {
      const timeoutMs = opts?.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      return realizeOne(input, timeoutMs);
    },

    async realizeMany(inputs: RealizeInput[], opts): Promise<RealizeResult[]> {
      if (inputs.length === 0) return [];
      const perCall = opts?.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      // One process/round-trip runs all N realizes sequentially inside the engine,
      // so give the batch call proportional wall-clock headroom.
      const batched = await realizeManyBatch(inputs, perCall * inputs.length);
      if (batched) return batched;
      // Fallback: engine without `batch` (old serve daemon / missing subcommand).
      const out: RealizeResult[] = [];
      for (const inp of inputs) out.push(await realizeOne(inp, perCall));
      return out;
    },

    async revise(input: ReviseInput, opts): Promise<ReviseResult> {
      const timeoutMs = opts?.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const file = toReviseFile(input);
      if (serveClient) {
        return reviseResultFromWire(await viaServe("revise", file, undefined, timeoutMs, true));
      }
      // revise --json exits 1 when REJECTED but still emits valid JSON — salvage it.
      const { stdout, exitCode } = await runJson("revise", file, timeoutMs, true);
      return reviseResultFromWire(parseJsonStdout(stdout, "revise", exitCode));
    },

    async forecast(input: ForecastInput, opts): Promise<ForecastResult> {
      const timeoutMs = opts?.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const file = toForecastFile(input);
      if (serveClient) {
        return forecastResultFromWire(
          await viaServe("forecast", file, undefined, timeoutMs, false),
        );
      }
      const { stdout, exitCode } = await runJson("forecast", file, timeoutMs, false);
      return forecastResultFromWire(parseJsonStdout(stdout, "forecast", exitCode));
    },

    async reason(input: ReasonInput, opts): Promise<ReasonResult> {
      const timeoutMs = opts?.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const file = toReasonFile(input);
      const args: Record<string, unknown> = {};
      if (input.maxRounds != null) args.max_rounds = input.maxRounds;
      if (input.realize === false) args.no_realize = true;
      if (input.view) args.view = input.view;
      if (input.scope !== undefined) args.scope = input.scope === true ? "auto" : input.scope;

      if (serveClient) {
        return reasonResultFromWire(await viaServe("reason", file, args, timeoutMs, true));
      }
      const extraArgs = [
        ...(input.maxRounds != null ? ["--max-rounds", String(input.maxRounds)] : []),
        ...(input.realize === false ? ["--no-realize"] : []),
        ...(input.view ? ["--view", input.view] : []),
        ...(input.scope !== undefined
          ? input.scope === true || input.scope === "auto"
            ? ["--auto-scope"]
            : ["--scope", JSON.stringify(input.scope)]
          : []),
      ];
      // reason --json exits 1 when unresolved / no fixpoint — both are data.
      const { stdout, exitCode } = await runJson("reason", file, timeoutMs, true, extraArgs);
      return reasonResultFromWire(parseJsonStdout(stdout, "reason", exitCode));
    },

    async verbalize(input: VerbalizeInput, opts): Promise<VerbalizeResult> {
      const timeoutMs = opts?.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      if (serveClient) {
        const { input: serveInput, args } = verbalizeServeInput(input);
        return verbalizeResultFromWire(
          await viaServe("verbalize", serveInput, args, timeoutMs, true),
        );
      }
      // verbalize takes the text as an argv arg (not a file); execFile keeps it
      // injection-safe. Exit 1 (unfaithful / parse error) still carries valid JSON.
      const args = ["-m", "logos", ...toVerbalizeArgs(input)];
      let stdout = "";
      let exitCode = 0;
      try {
        stdout = (await exec(pythonBin, args, { timeout: timeoutMs, maxBuffer: MAX_BUFFER }))
          .stdout;
      } catch (execErr) {
        const e = execErr as ExecFailure;
        const out = typeof e.stdout === "string" ? e.stdout : "";
        if (e.code === 1 && out.trim()) {
          stdout = out;
          exitCode = 1;
        } else if (out.trim()) {
          try {
            const raw = JSON.parse(out);
            throwIfSchemaValidationFailed(raw, typeof e.code === "number" ? e.code : null);
          } catch (parseOrSchema) {
            if (parseOrSchema instanceof LogosSchemaError) throw parseOrSchema;
          }
          translateExecError(e, pythonBin, timeoutMs);
        } else {
          translateExecError(e, pythonBin, timeoutMs);
        }
      }
      return verbalizeResultFromWire(parseJsonStdout(stdout, "verbalize", exitCode));
    },

    async strategize(input: StrategizeInput, opts): Promise<StrategizeResult> {
      const timeoutMs = opts?.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const file = toStrategizeFile(input);
      if (serveClient) {
        return strategizeResultFromWire(
          await viaServe("strategize", file, undefined, timeoutMs, true),
          input,
        );
      }
      // strategize --json exits 1 on escalate — salvage it.
      const { stdout, exitCode } = await runJson("strategize", file, timeoutMs, true);
      return strategizeResultFromWire(parseJsonStdout(stdout, "strategize", exitCode), input);
    },

    async ontologyLint(input: OntologyLintInput, opts): Promise<OntologyLintResult> {
      const timeoutMs = opts?.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const file = toOntologyLintFile(input);
      if (serveClient) {
        return ontologyLintResultFromWire(
          await viaServe("ontology-lint", file, undefined, timeoutMs, true),
        );
      }
      // ontology-lint --json exits 1 when ok:false but still emits structured JSON — salvage it.
      const { stdout, exitCode } = await runJson("ontology-lint", file, timeoutMs, true);
      return ontologyLintResultFromWire(parseJsonStdout(stdout, "ontology-lint", exitCode));
    },

    async close() {
      await serveClient?.close();
    },
  };
}
