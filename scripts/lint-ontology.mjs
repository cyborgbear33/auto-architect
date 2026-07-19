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
 *   2. This repo's catalog ↔ DL + cartridge parity lint (@auto/ontology's
 *      `runOntologyLint`, exercised end-to-end via
 *      packages/cartridges/src/ontology-lint.test.ts, which is also always
 *      on in the normal `pnpm test` run — this script just refuses to
 *      soft-skip it).
 *
 * Env:
 *   LOGOS_PYTHON_BIN   python executable (default "python3")
 *
 * Flags:
 *   --check   advisory: warn + exit 0 if logos is missing; still fail on a
 *             real lint error when logos is present
 */
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CHECK_ONLY = process.argv.includes("--check");
const PY = process.env.LOGOS_PYTHON_BIN || "python3";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

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
  return { ok: r.status === 0, status: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
}

console.log(cyan(`\nauto-architect ontology lint  (python: ${PY}${CHECK_ONLY ? ", --check" : ""})`));

// --- 1. Real LOGOS well-formedness -----------------------------------------
const help = run(PY, ["-m", "logos", "--help"]);
if (!help.ok) {
  const detail = `Cannot run '${PY} -m logos'. Install via pnpm setup:solver or set LOGOS_PYTHON_BIN.`;
  if (CHECK_ONLY) {
    console.warn(yellow(`\n⚠ ${detail}`));
    console.warn(yellow("  Skipping hard ontology lint."));
    process.exit(0);
  }
  console.error(red(`\n✗ ${detail}`));
  process.exit(1);
}
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

// --- 2. Catalog ↔ DL ↔ cartridge parity --------------------------------------
console.log(cyan("… running catalog ↔ DL ↔ cartridge parity tests"));
const parity = run("pnpm", ["--filter", "@auto/ontology", "--filter", "@auto/cartridges", "test"]);
process.stdout.write(parity.stdout);
process.stderr.write(parity.stderr);
if (!parity.ok) {
  console.error(red("\n✗ catalog ↔ DL ↔ cartridge parity failed"));
  process.exit(parity.status || 1);
}

console.log(green("\n✓ ontology-lint OK"));
process.exit(0);
