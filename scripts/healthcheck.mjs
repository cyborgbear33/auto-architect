#!/usr/bin/env node
/**
 * One-shot project health gate: typecheck, Biome, tests, ontology lint,
 * obd-gateway tests, web-ui build. Continues through failures so operators get
 * a full summary instead of stopping at the first red step.
 *
 * Usage:
 *   pnpm healthcheck           # full suite
 *   pnpm healthcheck --fast    # skip obd-gateway tests + web-ui build
 *
 * Env:
 *   LOGOS_PYTHON_BIN   forwarded to ontology lint (default python3)
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const FAST = process.argv.includes("--fast");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const venvPython = resolve(repoRoot, ".venv/bin/python3");

const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

/** @type {{ name: string, ok: boolean, skipped?: boolean, detail?: string }[]} */
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

console.log(cyan(`\nauto-architect healthcheck${FAST ? " (--fast)" : ""}`));

step("typecheck", () => {
  const r = run("pnpm", ["-r", "typecheck"]);
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  return { ok: r.ok, detail: r.ok ? undefined : "pnpm -r typecheck failed" };
});

step("lint (biome)", () => {
  const r = run("pnpm", ["exec", "biome", "check", "."]);
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  return { ok: r.ok, detail: r.ok ? undefined : "biome check failed — try pnpm lint:fix" };
});

step("unit tests (TS)", () => {
  const r = run("pnpm", ["-r", "test"]);
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  return { ok: r.ok, detail: r.ok ? undefined : "pnpm -r test failed" };
});

step("ontology lint", () => {
  const r = run("pnpm", ["lint:ontology", "--check"]);
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  return {
    ok: r.ok,
    detail: r.ok ? undefined : "ontology lint failed (or logos missing without --check soft-skip)",
  };
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

// Advisory only: garden-architect's logos-bridge twin may not be checked out
// next to this repo (never on CI), and drift is informational, not a bug by
// itself — see scripts/check-bridge-drift.mjs. Never contributes to `failed`.
step("logos-bridge seam drift vs garden-architect (advisory)", () => {
  const r = run("node", ["scripts/check-bridge-drift.mjs", "--quiet"]);
  process.stdout.write(r.stdout);
  process.stderr.write(r.stderr);
  // check-bridge-drift.mjs always exits 0 by design (it's a reminder, not a
  // gate) — this step is unconditionally advisory, never part of `failed`.
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
