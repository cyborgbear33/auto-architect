#!/usr/bin/env node
/**
 * One-shot project health gate: typecheck∥biome, tests, ontology well-formedness,
 * obd-gateway tests, web-ui build. Continues through failures so operators get
 * a full summary instead of stopping at the first red step.
 *
 * Usage:
 *   pnpm healthcheck           # full suite
 *   pnpm healthcheck --fast    # skip obd-gateway lint/tests + web-ui build
 *
 * Env:
 *   LOGOS_PYTHON_BIN   python for ontology / logos-bridge (default: .venv/bin/python3
 *                      when present, else python3)
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FAST = process.argv.includes("--fast");
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

function step(name, fn) {
  console.log(cyan(`\n▸ ${name}`));
  const outcome = fn();
  results.push({ name, ...outcome });
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

async function stepAsync(name, fn) {
  console.log(cyan(`\n▸ ${name}`));
  const outcome = await fn();
  results.push({ name, ...outcome });
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

async function main() {
  const logosHint = process.env.LOGOS_PYTHON_BIN
    ? `LOGOS_PYTHON_BIN=${process.env.LOGOS_PYTHON_BIN}`
    : "LOGOS_PYTHON_BIN unset";
  console.log(cyan(`\nauto-architect healthcheck${FAST ? " (--fast)" : ""}  (${logosHint})`));

  await stepAsync("typecheck ∥ lint (biome)", async () => {
    const [tc, lint] = await Promise.all([
      runAsync("pnpm", ["-r", "typecheck"]),
      runAsync("pnpm", ["exec", "biome", "check", "."]),
    ]);
    process.stdout.write(tc.stdout);
    process.stderr.write(tc.stderr);
    process.stdout.write(lint.stdout);
    process.stderr.write(lint.stderr);
    const parts = [];
    if (!tc.ok) parts.push("typecheck");
    if (!lint.ok) parts.push("biome");
    return {
      ok: tc.ok && lint.ok,
      detail: parts.length ? `failed: ${parts.join(", ")}` : undefined,
    };
  });

  step("unit tests (TS)", () => {
    const r = run("pnpm", ["-r", "test"]);
    process.stdout.write(r.stdout);
    process.stderr.write(r.stderr);
    return { ok: r.ok, detail: r.ok ? undefined : "pnpm -r test failed" };
  });

  // Parity already ran under pnpm -r test; this step is the unique LOGOS
  // well-formedness gate (soft-skips only that step if logos is missing).
  step("ontology well-formedness", () => {
    const r = run("pnpm", ["lint:ontology", "--wellformed-only"]);
    process.stdout.write(r.stdout);
    process.stderr.write(r.stderr);
    return {
      ok: r.ok,
      detail: r.ok ? undefined : "logos ontology well-formedness failed",
    };
  });

  step("obd-gateway lint (ruff)", () => {
    if (FAST) {
      return { ok: true, skipped: true, detail: "--fast" };
    }
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
    if (FAST) {
      return { ok: true, skipped: true, detail: "--fast" };
    }
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
    if (FAST) {
      return { ok: true, skipped: true, detail: "--fast" };
    }
    const r = run("pnpm", ["--filter", "@auto/web-ui", "build"]);
    process.stdout.write(r.stdout);
    process.stderr.write(r.stderr);
    return { ok: r.ok, detail: r.ok ? undefined : "web-ui build failed" };
  });

  step("logos-bridge seam drift vs garden-architect (advisory)", () => {
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
  console.log(green("\n✓ healthcheck OK"));
  process.exit(0);
}

main().catch((err) => {
  console.error(red(`\n✗ healthcheck crashed: ${err}`));
  process.exit(1);
});
