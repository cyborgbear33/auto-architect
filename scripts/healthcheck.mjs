#!/usr/bin/env node
/**
 * One-shot project health gate — single entry point for local sanity + full DoD.
 *
 * Usage:
 *   pnpm healthcheck              # sanity (default): typecheck∥biome∥tests∥ontology
 *   pnpm healthcheck --full       # + obd-gateway lint/tests + web-ui build
 *   pnpm healthcheck --fast       # alias for default sanity (compat)
 *   pnpm healthcheck --help
 *
 * Env:
 *   LOGOS_PYTHON_BIN   python for ontology / logos-bridge (default: .venv/bin/python3
 *                      when present, else python3)
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const argv = process.argv.slice(2);
const HELP = argv.includes("--help") || argv.includes("-h");
const FULL = argv.includes("--full");
/** Sanity = default; --fast kept as alias for scripts/muscle memory. */
const SANITY = !FULL;

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const venvPython = resolve(repoRoot, ".venv/bin/python3");

if (!process.env.LOGOS_PYTHON_BIN?.trim() && existsSync(venvPython)) {
  process.env.LOGOS_PYTHON_BIN = venvPython;
}

const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

/** @type {{ name: string, ok: boolean, skipped?: boolean, advisory?: boolean, detail?: string }[]} */
const results = [];

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    cwd: repoRoot,
    env: { ...process.env, ...opts.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    ok: r.status === 0,
    status: r.status ?? 1,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
  };
}

/** Concurrent spawn — used to run independent gates in parallel. */
function runAsync(cmd, args) {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolvePromise({
        ok: code === 0,
        status: code ?? 1,
        stdout,
        stderr,
      });
    });
    child.on("error", (err) => {
      resolvePromise({
        ok: false,
        status: 1,
        stdout: "",
        stderr: String(err),
      });
    });
  });
}

function printOutcome(name, outcome) {
  if (outcome.skipped) {
    console.log(yellow(`⊘ ${name}: skipped${outcome.detail ? ` — ${outcome.detail}` : ""}`));
  } else if (outcome.ok) {
    console.log(green(`✓ ${name}`));
  } else if (outcome.advisory) {
    console.log(yellow(`⚠ ${name}: advisory — see output above (does not fail healthcheck)`));
  } else {
    console.log(red(`✗ ${name}`));
    if (outcome.detail) console.log(outcome.detail);
  }
}

function step(name, fn) {
  console.log(cyan(`\n▸ ${name}`));
  const outcome = fn();
  results.push({ name, ...outcome });
  printOutcome(name, outcome);
}

async function stepAsync(name, fn) {
  console.log(cyan(`\n▸ ${name}`));
  const outcome = await fn();
  results.push({ name, ...outcome });
  printOutcome(name, outcome);
}

function printHelp() {
  console.log(`auto-architect healthcheck — one entry point for local gates

Usage:
  pnpm healthcheck              Sanity (default): typecheck ∥ biome ∥ tests ∥ ontology
  pnpm healthcheck --full       Complete DoD: sanity + obd-gateway + web-ui build
  pnpm healthcheck --fast       Alias for sanity (compat)

Env:
  LOGOS_PYTHON_BIN              Python for ontology lint (auto: .venv/bin/python3)

CI runs the equivalent of --full as discrete jobs; locally prefer sanity while
iterating and --full before merge / finishing meaningful work.
`);
}

async function main() {
  if (HELP) {
    printHelp();
    process.exit(0);
  }

  const logosHint = process.env.LOGOS_PYTHON_BIN
    ? `LOGOS_PYTHON_BIN=${process.env.LOGOS_PYTHON_BIN}`
    : "LOGOS_PYTHON_BIN unset";
  const modeLabel = FULL ? " (--full)" : " (sanity)";
  console.log(cyan(`\nauto-architect healthcheck${modeLabel}  (${logosHint})`));

  // Sanity core: independent gates in parallel so the day-to-day path stays fast.
  await stepAsync("typecheck ∥ lint ∥ tests ∥ ontology", async () => {
    const [tc, lint, tests, ontology] = await Promise.all([
      runAsync("pnpm", ["-r", "typecheck"]),
      runAsync("pnpm", ["exec", "biome", "check", "."]),
      runAsync("pnpm", ["-r", "test"]),
      // Parity already in pnpm -r test; unique LOGOS well-formedness gate here.
      runAsync("pnpm", ["lint:ontology", "--wellformed-only"]),
    ]);
    for (const r of [tc, lint, tests, ontology]) {
      process.stdout.write(r.stdout);
      process.stderr.write(r.stderr);
    }
    const parts = [];
    if (!tc.ok) parts.push("typecheck");
    if (!lint.ok) parts.push("biome");
    if (!tests.ok) parts.push("tests");
    if (!ontology.ok) parts.push("ontology");
    return {
      ok: tc.ok && lint.ok && tests.ok && ontology.ok,
      detail: parts.length ? `failed: ${parts.join(", ")}` : undefined,
    };
  });

  if (FULL) {
    step("obd-gateway lint (ruff)", () => {
      if (!existsSync(venvPython)) {
        return {
          ok: true,
          skipped: true,
          detail: ".venv missing — run pnpm obd-gateway:install",
        };
      }
      const r = run("pnpm", ["obd-gateway:lint"]);
      process.stdout.write(r.stdout);
      process.stderr.write(r.stderr);
      return { ok: r.ok, detail: r.ok ? undefined : "obd-gateway ruff failed" };
    });

    step("obd-gateway tests", () => {
      if (!existsSync(venvPython)) {
        return {
          ok: true,
          skipped: true,
          detail: ".venv missing — run pnpm obd-gateway:install",
        };
      }
      const r = run("pnpm", ["obd-gateway:test"]);
      process.stdout.write(r.stdout);
      process.stderr.write(r.stderr);
      return { ok: r.ok, detail: r.ok ? undefined : "obd-gateway pytest failed" };
    });

    step("web-ui build", () => {
      const r = run("pnpm", ["--filter", "@auto/web-ui", "build"]);
      process.stdout.write(r.stdout);
      process.stderr.write(r.stderr);
      return { ok: r.ok, detail: r.ok ? undefined : "web-ui build failed" };
    });
  } else {
    results.push({
      name: "obd-gateway + web-ui build",
      ok: true,
      skipped: true,
      detail: "sanity mode — use --full for DoD",
    });
    console.log(
      yellow(`\n⊘ obd-gateway + web-ui build: skipped — sanity mode (use --full for DoD)`),
    );
  }

  step("logos-bridge seam shim vs software-architect (advisory)", () => {
    const r = run("node", ["scripts/check-bridge-drift.mjs", "--quiet"]);
    process.stdout.write(r.stdout);
    process.stderr.write(r.stderr);
    return { ok: true, advisory: true };
  });

  console.log(cyan("\n── summary ──────────────────────────────"));
  let failed = 0;
  for (const r of results) {
    const mark = r.skipped
      ? yellow("SKIP")
      : r.advisory
        ? yellow("INFO")
        : r.ok
          ? green("PASS")
          : red("FAIL");
    const extra = r.skipped && r.detail ? ` (${r.detail})` : "";
    console.log(`  ${mark}  ${r.name}${extra}`);
    if (!r.ok && !r.skipped && !r.advisory) failed += 1;
  }

  if (failed > 0) {
    console.log(red(`\n✗ healthcheck failed (${failed} step(s))`));
    process.exit(1);
  }
  if (SANITY) {
    console.log(green("\n✓ healthcheck OK (sanity)"));
    console.log(cyan("  Tip: pnpm healthcheck --full  before merge / finishing meaningful work"));
  } else {
    console.log(green("\n✓ healthcheck OK (full)"));
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(red(`\n✗ healthcheck crashed: ${err}`));
  process.exit(1);
});
