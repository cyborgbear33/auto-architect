#!/usr/bin/env node
/**
 * Hard-fail ontology gate, run in CI and locally via `pnpm lint:ontology`.
 *
 * Two checks, both real (no synthesized "looks fine"):
 *   1. LOGOS well-formedness (`python -m logos ontology dl-ontology.json
 *      --json`) — undeclared class/role refs, malformed axioms. The engine's
 *      own `ontology-lint` command is deliberately Plant/family-shaped
 *      (garden-architect's taxon registry) and doesn't fit this domain, so
 *      we don't call it here — see packages/ontology/src/lint.ts for
 *      auto-architect's own catalog ↔ DL parity check instead.
 *   2. Narrow catalog ↔ DL + cartridge parity vitest (lint.test.ts +
 *      ontology-lint.test.ts only — not the full package test suites).
 *
 * Env:
 *   LOGOS_PYTHON_BIN   python executable (default "python3")
 *
 * Flags:
 *   --check            soft-skip well-formedness if logos is missing; still
 *                      run Python-free parity (and still fail on parity errors)
 *   --wellformed-only  run only the LOGOS well-formedness step (used by
 *                      `pnpm healthcheck` after `pnpm -r test` already covered
 *                      parity)
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CHECK_ONLY = process.argv.includes("--check");
const WELLFORMED_ONLY = process.argv.includes("--wellformed-only");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const venvPython = resolve(repoRoot, ".venv/bin/python3");

function resolvePython() {
  if (process.env.LOGOS_PYTHON_BIN?.trim()) return process.env.LOGOS_PYTHON_BIN.trim();
  if (existsSync(venvPython)) return venvPython;
  return "python3";
}

const PY = resolvePython();

const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;

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

const flags = [CHECK_ONLY ? "--check" : null, WELLFORMED_ONLY ? "--wellformed-only" : null]
  .filter(Boolean)
  .join(", ");

console.log(cyan(`\nauto-architect ontology lint  (python: ${PY}${flags ? `, ${flags}` : ""})`));

// --- 1. Real LOGOS well-formedness -----------------------------------------
const help = run(PY, ["-m", "logos", "--help"]);
const logosOk = help.ok;
if (!logosOk) {
  const detail = `Cannot run '${PY} -m logos'. Install via pnpm setup:solver or set LOGOS_PYTHON_BIN.`;
  if (CHECK_ONLY || WELLFORMED_ONLY) {
    // --wellformed-only with missing logos: soft-skip (healthcheck already
    // ran parity under pnpm -r test). --check: soft-skip well-formedness only.
    console.warn(yellow(`\n⚠ ${detail}`));
    console.warn(yellow("  Skipping LOGOS well-formedness."));
    if (WELLFORMED_ONLY) process.exit(0);
  } else {
    console.error(red(`\n✗ ${detail}`));
    process.exit(1);
  }
}

if (logosOk) {
  console.log(green("✓ logos available"));
  console.log(cyan("… checking DL well-formedness (logos ontology --json)"));
  const wf = run(PY, ["-m", "logos", "ontology", "packages/ontology/dl-ontology.json", "--json"]);
  if (!wf.ok) {
    console.error(red("\n✗ `logos ontology` failed to run"));
    console.error(wf.stderr || wf.stdout);
    process.exit(wf.status || 1);
  }
  let wfReport;
  try {
    wfReport = JSON.parse(wf.stdout);
  } catch {
    console.error(red("\n✗ `logos ontology --json` did not emit valid JSON"));
    console.error(wf.stdout);
    process.exit(1);
  }
  if (!wfReport.well_formedness?.ok) {
    console.error(red("\n✗ dl-ontology.json is not well-formed:"));
    console.error(JSON.stringify(wfReport.well_formedness?.issues ?? wfReport, null, 2));
    process.exit(1);
  }
  console.log(green(`✓ well-formed: ${wfReport.classes} classes, ${wfReport.roles} roles`));
}

if (WELLFORMED_ONLY) {
  console.log(green("\n✓ ontology-lint OK (well-formedness only)"));
  process.exit(0);
}

// --- 2. Narrow catalog ↔ DL ↔ cartridge parity (Python-free) -----------------
console.log(cyan("… running narrow catalog ↔ DL ↔ cartridge parity tests"));
const ontologyParity = run("pnpm", [
  "--filter",
  "@auto/ontology",
  "exec",
  "vitest",
  "run",
  "src/lint.test.ts",
  "src/fixtures.test.ts",
]);
process.stdout.write(ontologyParity.stdout);
process.stderr.write(ontologyParity.stderr);
if (!ontologyParity.ok) {
  console.error(red("\n✗ @auto/ontology parity / fixture checks failed"));
  process.exit(ontologyParity.status || 1);
}

const cartridgeParity = run("pnpm", [
  "--filter",
  "@auto/cartridges",
  "exec",
  "vitest",
  "run",
  "src/ontology-lint.test.ts",
]);
process.stdout.write(cartridgeParity.stdout);
process.stderr.write(cartridgeParity.stderr);
if (!cartridgeParity.ok) {
  console.error(red("\n✗ @auto/cartridges ontology parity failed"));
  process.exit(cartridgeParity.status || 1);
}

console.log(green("\n✓ ontology-lint OK"));
process.exit(0);
